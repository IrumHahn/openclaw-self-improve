#!/usr/bin/env node
// 팀 전원의 AGENTS.md 에 성장 노트 행동 구역을 넣는다(멱등, 백업). 총괄에는 저녁 정리 담당 문단을 더한다.
//   node scripts/install_hook.mjs (--all-agents | --team <team.json> | --workspace <dir>) [--remove] [--dry-run]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BLOCK_START = '<!-- self-improve-hook:start -->';
export const BLOCK_END = '<!-- self-improve-hook:end -->';
const BLOCK_PATTERN = new RegExp(`\\n?${BLOCK_START}[\\s\\S]*?${BLOCK_END}\\n?`);
const USAGE = 'node install_hook.mjs (--all-agents | --team <team.json> | --workspace <dir>) [--remove] [--dry-run]';

export const MEMBER_HOOK = `## 성장 노트 — 일하면서 배운 점 메모하기

아래 일이 생기면 그 자리에서 \`self-improve\` 스킬의 1절(메모하기) 절차로 한 줄 메모한다(교훈 한 문장, 비밀번호·토큰·개인정보 금지):
- 주인이 방식을 고쳐 줬다(교정) · 명령이나 도구가 실패했고 원인을 알았다(실패) · 시행착오 끝에 되는 길을 찾았다(더 나은 방법)
- 주인이 "이런 것도 해 줘"라고 했다(바라는 기능) · 같은 종류의 일을 또 했다(반복 작업) · 말하지 않았지만 주인의 일하는 방식이 또 보였다(주인 성향)
주인이 "방금 그거 기억해"라고 하면 교정으로 메모한다. 메모했다고 매번 알리지 않는다. 규칙 파일(AGENTS.md·TOOLS.md·SOUL.md·USER.md)과 스킬은 직접 고치지 않는다. 고칠 점은 메모로 남기면 총괄이 저녁에 모아 주인 승인을 받는다.`;

export const MAIN_HOOK = `총괄은 매일 22:00 성장 노트 저녁 정리(일요일은 주간 정리)를 맡는다. 주인이 "1 승인", "2 거절", "전부 승인", "1 나중에", "1 되돌려", "방금 거 되돌려", "2 보여 줘", "성장 노트 보여 줘"라고 하면 \`self-improve\` 스킬 절차대로 처리한다.`;

export function upsertBlock(text, content) {
  const block = `${BLOCK_START}\n${content.trim()}\n${BLOCK_END}`;
  if (text.includes(BLOCK_START)) return text.replace(BLOCK_PATTERN, m => `${m.startsWith('\n') ? '\n' : ''}${block}\n`);
  const separator = text === '' ? '' : text.endsWith('\n') ? '\n' : '\n\n';
  return `${text}${separator}${block}\n`;
}

export function removeBlock(text) { return text.replace(BLOCK_PATTERN, ''); }

// 시작 표시는 있는데 그 뒤에 끝 표시가 없으면 구역이 망가진 것이다. 고치지 않고 알린다.
export function blockBroken(text) {
  const start = text.indexOf(BLOCK_START);
  return start !== -1 && text.indexOf(BLOCK_END, start) === -1;
}

function parseArgs(argv) {
  const out = { workspace: null, team: null, allAgents: false, remove: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--workspace' || a === '--team') {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`missing value for ${a}\n${USAGE}`);
      out[a.slice(2)] = value;
    } else if (a === '--all-agents') out.allAgents = true;
    else if (a === '--remove') out.remove = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '-h' || a === '--help') { console.log(USAGE); process.exit(0); }
    else throw new Error(`unknown argument: ${a}\n${USAGE}`);
  }
  if ([out.workspace, out.team, out.allAgents || null].filter(Boolean).length !== 1) throw new Error(`--all-agents, --team, --workspace 중 하나만 주세요\n${USAGE}`);
  return out;
}

function targets(opts) {
  if (opts.workspace) return [{ id: 'main', workspace: path.resolve(opts.workspace), isMain: true }];
  let agents;
  if (opts.team) agents = JSON.parse(fs.readFileSync(path.resolve(opts.team), 'utf8'));
  else {
    const r = spawnSync('openclaw', ['agents', 'list', '--json'], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`openclaw agents list failed: ${r.stderr || r.error?.message}`);
    agents = JSON.parse(r.stdout);
  }
  if (agents && !Array.isArray(agents) && Array.isArray(agents.agents)) agents = agents.agents;
  if (!Array.isArray(agents)) throw new Error('team list must be a JSON array (or { agents: [...] })');
  const valid = agents.filter(a => a && typeof a.id === 'string' && typeof a.workspace === 'string' && a.workspace);
  const hasDefault = valid.some(a => a.isDefault);
  return valid.map(a => ({ id: a.id, workspace: path.resolve(a.workspace), isMain: hasDefault ? Boolean(a.isDefault) : a.id === 'main' }));
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const results = [];
  const list = targets(opts);
  for (const agent of list) {
    const target = path.join(agent.workspace, 'AGENTS.md');
    if (!fs.existsSync(agent.workspace)) { results.push({ agent: agent.id, target, skipped: 'workspace missing' }); continue; }
    const before = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
    if (blockBroken(before)) { results.push({ agent: agent.id, target, error: 'end marker missing' }); continue; }
    const content = agent.isMain ? `${MEMBER_HOOK}\n\n${MAIN_HOOK}` : MEMBER_HOOK;
    const after = opts.remove ? removeBlock(before) : upsertBlock(before, content);
    const result = { agent: agent.id, main: agent.isMain, target, changed: before !== after, backup: null };
    if (result.changed && !opts.dryRun) {
      if (before !== '') { result.backup = `${target}.bak-self-improve-${stamp}`; fs.copyFileSync(target, result.backup); }
      fs.writeFileSync(target, after, 'utf8');
    }
    results.push(result);
  }
  const output = { action: opts.remove ? 'remove' : 'install', dryRun: opts.dryRun, results };
  if (!list.some(a => a.isMain)) output.warning = 'no main agent found (isDefault or id "main"); the evening-review paragraph was not added to anyone';
  console.log(JSON.stringify(output, null, 2));
  if (results.some(r => r.error)) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try { main(); } catch (error) { console.error(error.message); process.exit(1); }
}
