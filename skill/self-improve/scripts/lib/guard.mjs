import fs from 'node:fs';
import path from 'node:path';
import { SKILL_NAME_RE } from './notes.mjs';
import { fail } from './util.mjs';

export const RULE_FILES = ['AGENTS.md', 'TOOLS.md', 'SOUL.md', 'USER.md'];
const SKILL_NAME_SOURCE = SKILL_NAME_RE.source.slice(1, -1);
const SKILL_FILE_RE = new RegExp(`^skills/${SKILL_NAME_SOURCE}/(SKILL\\.md|references/[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*\\.md)$`);

export function isRuleFile(rel) { return RULE_FILES.includes(rel); }

function lstatOrNull(target) {
  try { return fs.lstatSync(target); } catch { return null; }
}

// workspace 기준 상대경로 → 절대경로. 허용 목록 밖이거나, 경로 중 하나라도 바로가기(심볼릭 링크)이거나, 실제 위치가 workspace 밖이면 거부한다.
export function resolveTarget(workspace, rel) {
  if (typeof rel !== 'string' || !rel) fail('file is required');
  if (path.isAbsolute(rel) || rel.includes('\\') || rel.split('/').includes('..') || path.posix.normalize(rel) !== rel)
    fail(`허용되지 않은 위치예요: ${rel}`);
  if (rel.startsWith('skills/self-improve/')) fail(`성장 노트 스킬 자신은 고칠 수 없어요: ${rel}`);
  if (!isRuleFile(rel) && !SKILL_FILE_RE.test(rel)) fail(`성장 노트가 고칠 수 없는 파일이에요: ${rel} (not allowed)`);
  const abs = path.join(workspace, rel);
  const realWorkspace = fs.realpathSync(workspace);

  // workspace 안쪽을 가리키는 바로가기도 허용 목록을 우회할 수 있으므로, 존재하는 모든 경로 조각을 lstat 으로 확인한다(깨진 링크 포함).
  let walk = workspace;
  for (const part of rel.split('/')) {
    walk = path.join(walk, part);
    const stat = lstatOrNull(walk);
    if (!stat) break;
    if (stat.isSymbolicLink()) {
      const escapes = (() => { try { const real = fs.realpathSync(walk); return real !== realWorkspace && !real.startsWith(realWorkspace + path.sep); } catch { return false; } })();
      if (escapes) fail(`작업 폴더 밖을 가리켜요: ${rel} (outside workspace)`);
      fail(`바로가기(심볼릭 링크)로 된 파일은 고칠 수 없어요: ${rel}`);
    }
  }

  let probe = abs;
  while (!lstatOrNull(probe)) probe = path.dirname(probe);
  const realProbe = fs.realpathSync(probe);
  if (realProbe !== realWorkspace && !realProbe.startsWith(realWorkspace + path.sep)) fail(`작업 폴더 밖을 가리켜요: ${rel} (outside workspace)`);
  return abs;
}
