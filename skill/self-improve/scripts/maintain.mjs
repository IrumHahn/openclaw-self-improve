#!/usr/bin/env node
// 매일 저녁 정리 전에 실행: 7일 지난 대기 제안 만료, 30일 지난 처리 끝 메모·바라는 기능 메모와 백업을 archive/ 로 옮긴다(삭제 없음).
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, requireAbs } from './lib/args.mjs';
import { withLock } from './lib/lock.mjs';
import { ARCHIVE_DAYS, EXPIRE_DAYS, learningsPaths, listProposals, pendingProposals, readState, saveProposal, writeState } from './lib/state.mjs';
import { loadTeam } from './lib/team.mjs';
import { appendJsonl, atomicWrite, DAY_MS, kstISO, movePath, nowFrom, readJsonlLenient, runMain } from './lib/util.mjs';

const USAGE = 'node maintain.mjs --workspace <main abs> [--team <abs>] [--now <iso>]';

runMain(() => {
  const o = parseArgs(process.argv.slice(2), { workspace: 'string', team: 'string', now: 'string' }, USAGE);
  const workspace = requireAbs(o, 'workspace');
  withLock(workspace, () => {
    const now = nowFrom(o.now);
    const paths = learningsPaths(workspace);

    const expired = [];
    const released = new Set();
    for (const p of pendingProposals(workspace)) {
      if (now - new Date(p.createdAt) < EXPIRE_DAYS * DAY_MS) continue;
      p.status = 'expired';
      p.expiredAt = kstISO(now);
      saveProposal(workspace, p);
      appendJsonl(paths.ledger, { at: p.expiredAt, action: 'expired', id: p.id, type: p.type, agent: p.agent, key: p.key });
      expired.push(p.id);
      for (const id of Array.isArray(p.noteIds) ? p.noteIds : []) released.add(id);
    }

    const state = readState(workspace);
    // 만료된 제안에 쓰인 메모는 '처리됨'에서 풀어, 다음 저녁 정리에서 다시 보이게 한다.
    const processed = new Set(state.processed.filter(id => !released.has(id)));
    const cutoff = now.getTime() - ARCHIVE_DAYS * DAY_MS;
    let archivedNotes = 0;
    const skipped = [];
    for (const agent of loadTeam(o.team, workspace)) {
      const file = learningsPaths(agent.workspace).notes;
      if (!fs.existsSync(file)) continue;
      const sizeBefore = fs.statSync(file).size;
      const read = readJsonlLenient(file);
      // 깨진 줄이 있는 파일은 다시 쓰면 그 줄이 사라지므로 건드리지 않고 알려 준다.
      if (read.broken.length) { skipped.push({ agent: agent.id, file: 'notes.jsonl', lines: read.broken }); continue; }
      const keep = [];
      const move = [];
      for (const n of read.records) {
        const old = typeof n?.ts === 'string' && !Number.isNaN(new Date(n.ts).getTime()) && new Date(n.ts).getTime() < cutoff;
        (old && (processed.has(n.id) || n.kind === 'wish') ? move : keep).push(n);
      }
      if (!move.length) continue;
      // 먼저 다 계산해 두고, 그 사이 메모가 추가되지 않았는지(파일 크기) 확인한 뒤에만 보관 파일과 원본을 쓴다.
      const archiveDir = learningsPaths(agent.workspace).archive;
      const byMonth = new Map();
      for (const n of move) byMonth.set(n.ts.slice(0, 7), `${byMonth.get(n.ts.slice(0, 7)) ?? ''}${JSON.stringify(n)}\n`);
      const changed = () => fs.statSync(file).size !== sizeBefore;
      if (changed()) { skipped.push({ agent: agent.id, file: 'notes.jsonl', changed: true }); continue; }
      fs.mkdirSync(archiveDir, { recursive: true });
      for (const [month, text] of byMonth) fs.appendFileSync(path.join(archiveDir, `notes-${month}.jsonl`), text, { encoding: 'utf8', mode: 0o600 });
      if (changed()) { skipped.push({ agent: agent.id, file: 'notes.jsonl', changed: true }); continue; }
      atomicWrite(file, keep.map(n => `${JSON.stringify(n)}\n`).join(''), 0o600);
      for (const n of move) processed.delete(n.id);
      archivedNotes += move.length;
    }
    state.processed = [...processed];
    writeState(workspace, state);

    let archivedBackups = 0;
    const appliedAt = new Map(listProposals(workspace).map(p => [p.id, p.appliedAt ?? p.createdAt]));
    if (fs.existsSync(paths.backups)) {
      for (const id of fs.readdirSync(paths.backups)) {
        const at = appliedAt.get(id);
        if (!at || new Date(at).getTime() >= cutoff) continue;
        const dest = path.join(paths.archive, 'backups', id);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.renameSync(path.join(paths.backups, id), dest);
        archivedBackups += 1;
      }
    }
    console.log(JSON.stringify({ expired, archivedNotes, archivedBackups, skipped }, null, 2));
  });
});
