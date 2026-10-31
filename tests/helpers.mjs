import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const scriptsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'skill', 'self-improve', 'scripts');

export function run(script, args) {
  return spawnSync(process.execPath, [path.join(scriptsDir, script), ...args], { encoding: 'utf8' });
}
export function runOk(script, args) {
  const result = run(script, args);
  if (result.status !== 0) throw new Error(`${script} failed (${result.status}): ${result.stderr}`);
  return result.stdout;
}
export function runJson(script, args) { return JSON.parse(runOk(script, args)); }

// 총괄(main) + 팀원(researcher) 두 workspace 와 team.json
export function setup() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'self-improve-')));
  const main = path.join(root, 'main');
  const researcher = path.join(root, 'researcher');
  fs.mkdirSync(main); fs.mkdirSync(researcher);
  const team = path.join(root, 'team.json');
  fs.writeFileSync(team, JSON.stringify([{ id: 'main', workspace: main, isDefault: true }, { id: 'researcher', workspace: researcher }]));
  return { root, main, researcher, team, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

export const T0 = '2026-11-02T10:00:00+09:00';
export const EVENING = '2026-11-02T22:00:00+09:00';

export function note(ws, agent, kind, key, lesson, target, now = T0, extra = []) {
  return runJson('note.mjs', ['--workspace', ws, '--agent', agent, '--kind', kind, '--key', key, '--lesson', lesson, '--target', target, '--now', now, ...extra]);
}

export function writeProposal(env, body) {
  const file = path.join(env.root, `prop-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(file, JSON.stringify(body));
  return file;
}
export function propose(env, body, now = EVENING) {
  return runJson('propose.mjs', ['--workspace', env.main, '--team', env.team, '--file', writeProposal(env, body), '--now', now]);
}
export function message(env, now = EVENING) {
  return runOk('status.mjs', ['--workspace', env.main, '--team', env.team, '--message', '--now', now]);
}
