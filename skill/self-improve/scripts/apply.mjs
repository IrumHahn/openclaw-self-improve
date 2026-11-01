#!/usr/bin/env node
// 대표님이 승인한 제안을 반영한다. 허용 파일 · 정확히 1회 일치 · (바꿔치기는) 제안 뒤 변경 없음(sha)을 확인하고, 백업 후 원자적으로 쓴다.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, requireAbs } from './lib/args.mjs';
import { resolveTarget } from './lib/guard.mjs';
import { withLock } from './lib/lock.mjs';
import { scopeLabel } from './lib/render.mjs';
import { MARKERS_ERASED, appendRule, markersIntact } from './lib/section.mjs';
import { learningsPaths, loadProposal, numberOf, readLedger, readState, saveProposal, writeState } from './lib/state.mjs';
import { appendJsonl, atomicWrite, countOccurrences, fail, fileSha, kstDate, kstISO, listFilesRelative, nowFrom, runMain, sha256 } from './lib/util.mjs';

const USAGE = 'node apply.mjs --workspace <main abs> (--id <id> | --number <n> | --all) [--now <iso>]';

function lstatOrNull(target) {
  try { return fs.lstatSync(target); } catch { return null; }
}

// 낡은 제안은 닫아서(stale) 같은 열쇠로 다음 저녁에 새로 제안할 수 있게 한다.
function markStale(workspace, p, now, reason) {
  const at = kstISO(now);
  appendJsonl(learningsPaths(workspace).ledger, { at, action: 'stale', id: p.id, type: p.type, agent: p.agent, key: p.key, reason });
  p.status = 'stale';
  p.staleAt = at;
  saveProposal(workspace, p);
  // 이 제안에 쓰인 메모를 '처리됨'에서 풀어, 다음 저녁 정리에서 그 묶음이 다시 보이게 한다.
  const released = new Set(Array.isArray(p.noteIds) ? p.noteIds : []);
  if (released.size) {
    const state = readState(workspace);
    state.processed = state.processed.filter(id => !released.has(id));
    writeState(workspace, state);
  }
}

function done(workspace, p) {
  const number = numberOf(workspace, p.id);
  return `반영했어요 — ${scopeLabel(p)}.${number ? ` 되돌리려면 "${number} 되돌려"` : ''}`;
}

function applyOne(workspace, p, now) {
  if (p.status !== 'pending') fail(`이미 처리된 제안이에요 (${p.status})`);
  const paths = learningsPaths(workspace);
  const ledger = readLedger(workspace); // 장부가 망가졌으면 파일을 고치기 전에 멈춘다
  // 반영은 됐는데 제안 상태를 저장하기 전에 멈췄던 경우: 다시 쓰지 않고 상태만 맞춘다.
  const already = ledger.filter(e => e.id === p.id && e.action === 'applied').at(-1);
  if (already) {
    p.status = 'applied';
    p.appliedAt = already.at;
    saveProposal(workspace, p);
    return done(workspace, p);
  }
  const backupDir = path.join(paths.backups, p.id);
  const originalBackup = path.join(backupDir, 'original');
  const appliedBackup = path.join(backupDir, 'applied');
  let entry;
  if (p.type === 'new_skill') {
    const dest = path.join(p.workspace, 'skills', p.skillName);
    const existing = lstatOrNull(dest);
    if (existing) {
      // 파일은 써졌는데 장부에 적기 전에 멈춘 경우: 내용이 같으면 장부만 채운다. 그 밖에는 이미 있는 스킬이다(깨진 바로가기 포함).
      const skillFile = existing.isDirectory() ? resolveTarget(p.workspace, `skills/${p.skillName}/SKILL.md`) : null;
      if (!skillFile || !fs.existsSync(skillFile) || fs.readFileSync(skillFile, 'utf8') !== p.skillMd) fail(`같은 이름의 스킬이 이미 있어요: ${p.skillName}`);
    } else {
      atomicWrite(resolveTarget(p.workspace, `skills/${p.skillName}/SKILL.md`), p.skillMd, 0o644);
    }
    entry = { created: dest, skillSha: sha256(p.skillMd), files: listFilesRelative(dest) };
  } else {
    const abs = resolveTarget(p.workspace, p.file);
    const current = fileSha(abs);
    if (current !== 'absent' && fs.existsSync(appliedBackup) && sha256(fs.readFileSync(appliedBackup)) === current) {
      // 이미 반영된 파일이다(쓰기 뒤 장부 전에 멈춤). 아무것도 다시 쓰지 않고 있는 백업으로 장부만 채운다.
      entry = { file: p.file, workspace: p.workspace, beforeSha: fileSha(originalBackup), afterSha: current, backup: fs.existsSync(originalBackup) ? originalBackup : null };
    } else {
      const before = current === 'absent' ? '' : fs.readFileSync(abs, 'utf8');
      let after;
      if (p.type === 'append') {
        // 덧붙이기는 구역 안에 한 줄만 더하므로 다른 부분이 바뀌었어도 안전하다. 구역이 망가졌거나 가득 찼는지만 현재 파일로 다시 본다.
        try {
          after = appendRule(before, p.file, `${p.kind === 'user_trait' ? '(추정) ' : ''}${p.line} (${kstDate(now)} 승인)`);
        } catch (error) {
          markStale(workspace, p, now, error.message);
          throw error;
        }
      } else {
        if (current !== p.baseSha) {
          markStale(workspace, p, now, 'file changed since proposal');
          fail('그 사이 파일이 바뀌어 제안이 낡았어요. 다시 만들게요 (file changed since proposal)', 4);
        }
        const count = countOccurrences(before, p.old);
        if (count !== 1) {
          markStale(workspace, p, now, `old found ${count} times`);
          fail(`제안이 낡았어요. 바꿀 문장이 파일에 정확히 한 번 있어야 해요 (found ${count})`, 4);
        }
        after = before.replace(p.old, () => p.new);
        if (!markersIntact(before, after)) fail(MARKERS_ERASED);
      }
      fs.mkdirSync(backupDir, { recursive: true });
      // 원본 백업은 절대 덮어쓰지 않는다(이미 있으면 그대로 둔다).
      if (current !== 'absent') {
        try { fs.copyFileSync(abs, originalBackup, fs.constants.COPYFILE_EXCL); } catch (error) { if (error.code !== 'EEXIST') throw error; }
      }
      fs.writeFileSync(appliedBackup, after, { mode: 0o600 });
      atomicWrite(abs, after);
      entry = { file: p.file, workspace: p.workspace, beforeSha: current, afterSha: sha256(after), backup: current !== 'absent' ? originalBackup : null };
    }
  }
  p.status = 'applied';
  p.appliedAt = kstISO(now);
  // 장부를 먼저 쓴다: 사이에 멈추면 다시 실행할 때 위의 '이미 반영' 경로로 상태만 맞춘다.
  appendJsonl(paths.ledger, { at: p.appliedAt, action: 'applied', id: p.id, type: p.type, agent: p.agent, key: p.key, ...entry });
  saveProposal(workspace, p);
  return done(workspace, p);
}

runMain(() => {
  const o = parseArgs(process.argv.slice(2), { workspace: 'string', id: 'string', number: 'string', all: 'bool', now: 'string' }, USAGE);
  const workspace = requireAbs(o, 'workspace');
  const now = nowFrom(o.now);
  withLock(workspace, () => {
    if (!o.all) {
      const p = loadProposal(workspace, { id: o.id, number: o.number });
      console.log(JSON.stringify({ ok: true, id: p.id, message: applyOne(workspace, p, now) }, null, 2));
      return;
    }
    const map = readState(workspace).lastMessage?.map ?? {};
    const results = [];
    for (const [number, id] of Object.entries(map)) {
      try {
        const p = loadProposal(workspace, { id });
        if (p.status !== 'pending') continue;
        results.push({ number, id, ok: true, message: applyOne(workspace, p, now) });
      } catch (error) {
        results.push({ number, id, ok: false, error: error.message });
      }
    }
    console.log(JSON.stringify({ results }, null, 2));
    if (results.some(r => !r.ok)) process.exitCode = 1;
  });
});
