#!/usr/bin/env node
// 반영한 제안을 되돌린다. 반영 뒤 파일이 또 바뀌었으면 멈추고(exit 2) 차이를 보여 준다. 지우지 않고 archive/ 로 옮긴다.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, requireAbs } from './lib/args.mjs';
import { resolveTarget } from './lib/guard.mjs';
import { withLock } from './lib/lock.mjs';
import { scopeLabel } from './lib/render.mjs';
import { learningsPaths, listProposals, loadProposal, readLedger, saveProposal } from './lib/state.mjs';
import { appendJsonl, atomicWrite, fail, fileSha, kstISO, listFilesRelative, movePath, nowFrom, runMain } from './lib/util.mjs';

const USAGE = 'node rollback.mjs --workspace <main abs> (--id <id> | --number <n> | --last) [--force] [--now <iso>]';
const NO_BACKUP = '되돌릴 원본을 찾을 수 없어요. 새 수정 제안으로 고칠게요';

function lineDiff(fromText, toText) {
  const from = new Set(fromText.split('\n'));
  const to = new Set(toText.split('\n'));
  return {
    addedSinceApply: [...to].filter(l => l && !from.has(l)).slice(0, 10),
    removedSinceApply: [...from].filter(l => l && !to.has(l)).slice(0, 10),
  };
}

function moveToArchive(paths, source, name) {
  movePath(source, path.join(paths.archive, 'rolled-back', name));
}

function lastApplied(workspace) {
  const status = new Map(listProposals(workspace).map(p => [p.id, p.status]));
  const entry = readLedger(workspace).filter(e => e.action === 'applied' && status.get(e.id) === 'applied').at(-1);
  if (!entry) fail('되돌릴 수 있는 반영 기록이 없어요 (nothing to roll back)');
  return entry.id;
}

function conflict(message, details) {
  console.log(JSON.stringify({ conflict: true, message, ...details }, null, 2));
  process.exitCode = 2;
}

runMain(() => {
  const o = parseArgs(process.argv.slice(2), { workspace: 'string', id: 'string', number: 'string', last: 'bool', force: 'bool', now: 'string' }, USAGE);
  const workspace = requireAbs(o, 'workspace');
  const now = nowFrom(o.now);
  const paths = learningsPaths(workspace);
  if (o.last && (o.id || o.number)) fail('--last 는 --id/--number 와 함께 쓸 수 없어요');
  withLock(workspace, () => {
    const p = loadProposal(workspace, o.last ? { id: lastApplied(workspace) } : { id: o.id, number: o.number });
    if (p.status !== 'applied') fail(`되돌릴 수 있는 상태가 아니에요 (${p.status})`);
    const entry = readLedger(workspace).filter(e => e.id === p.id && e.action === 'applied').at(-1);
    if (!entry) fail('장부에 반영 기록이 없어요 (no applied ledger entry)');

    if (p.type === 'new_skill') {
      if (fs.existsSync(entry.created)) {
        if (entry.skillSha && !o.force) {
          const skillFile = path.join(entry.created, 'SKILL.md');
          const files = listFilesRelative(entry.created);
          const wanted = entry.files ?? [];
          if (fileSha(skillFile) !== entry.skillSha || JSON.stringify(files) !== JSON.stringify(wanted)) {
            const currentText = fs.existsSync(skillFile) ? fs.readFileSync(skillFile, 'utf8') : '';
            conflict('반영한 뒤에 이 스킬이 또 바뀌었어요. 그래도 되돌리면 그 뒤에 바뀐 내용은 보관 폴더로 옮겨져요. 대표님에게 확인받은 뒤 --force 로 다시 실행하세요.', {
              ...lineDiff(p.skillMd, currentText),
              addedFiles: files.filter(f => !wanted.includes(f)),
              removedFiles: wanted.filter(f => !files.includes(f)),
            });
            return;
          }
        }
        moveToArchive(paths, entry.created, `${p.id}-${p.skillName}`);
      }
    } else {
      const abs = resolveTarget(p.workspace, p.file);
      const current = fileSha(abs);
      // 보관(maintain)으로 옮겨진 백업도 id 로 찾는다.
      const dirs = [path.join(paths.backups, p.id), path.join(paths.archive, 'backups', p.id)];
      const find = name => dirs.map(d => path.join(d, name)).find(f => fs.existsSync(f)) ?? null;
      if (current !== entry.afterSha && !o.force) {
        const appliedFile = find('applied');
        if (!appliedFile) fail(NO_BACKUP);
        const currentText = current === 'absent' ? '' : fs.readFileSync(abs, 'utf8');
        conflict('반영한 뒤에 이 파일이 또 바뀌었어요. 그래도 되돌리면 그 뒤에 바뀐 내용이 사라져요. 대표님에게 확인받은 뒤 --force 로 다시 실행하세요.', lineDiff(fs.readFileSync(appliedFile, 'utf8'), currentText));
        return;
      }
      const original = entry.backup ? find('original') : null;
      if (entry.backup && !original) fail(NO_BACKUP); // 아무것도 바꾸기 전에 멈춘다
      if (current !== 'absent') {
        const saveDir = dirs.find(d => fs.existsSync(d)) ?? dirs[0];
        fs.mkdirSync(saveDir, { recursive: true });
        fs.copyFileSync(abs, path.join(saveDir, 'before-rollback'));
      }
      if (original) atomicWrite(abs, fs.readFileSync(original));
      else if (current !== 'absent') moveToArchive(paths, abs, `${p.id}-${path.basename(p.file)}`);
    }
    p.status = 'rolled_back';
    p.rolledBackAt = kstISO(now);
    saveProposal(workspace, p);
    appendJsonl(paths.ledger, { at: p.rolledBackAt, action: 'rolled_back', id: p.id, type: p.type, agent: p.agent, key: p.key, forced: Boolean(o.force) });
    console.log(JSON.stringify({ ok: true, id: p.id, message: `되돌렸어요 — ${scopeLabel(p)}.` }, null, 2));
  });
});
