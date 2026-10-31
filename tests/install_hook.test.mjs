import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { setup } from './helpers.mjs';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'install_hook.mjs');
const hook = args => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

test('installs member hook for teammates and member+main hook for main; idempotent; keeps other blocks; --remove', () => {
  const env = setup();
  try {
    const mainAgents = path.join(env.main, 'AGENTS.md');
    fs.writeFileSync(mainAgents, '# 총괄\n<!-- task-planner:start -->\nX\n<!-- task-planner:end -->\n');
    assert.equal(hook(['--team', env.team]).status, 0);
    const once = fs.readFileSync(mainAgents, 'utf8');
    assert.match(once, /<!-- task-planner:start -->/);
    assert.match(once, /<!-- self-improve-hook:start -->\n## 성장 노트 — 일하면서 배운 점 메모하기/);
    assert.match(once, /총괄은 매일 22:00/);
    const member = fs.readFileSync(path.join(env.researcher, 'AGENTS.md'), 'utf8');
    assert.match(member, /self-improve-hook:start/);
    assert.doesNotMatch(member, /총괄은 매일 22:00/);
    assert.equal(hook(['--team', env.team]).status, 0);
    assert.equal(fs.readFileSync(mainAgents, 'utf8'), once, 'idempotent');
    assert.equal(hook(['--team', env.team, '--remove']).status, 0);
    assert.equal(fs.readFileSync(mainAgents, 'utf8'), '# 총괄\n<!-- task-planner:start -->\nX\n<!-- task-planner:end -->\n');
  } finally { env.cleanup(); }
});

test('backs up an existing AGENTS.md before changing it; --dry-run writes nothing', () => {
  const env = setup();
  try {
    const mainAgents = path.join(env.main, 'AGENTS.md');
    fs.writeFileSync(mainAgents, '# 총괄\n');
    const dry = hook(['--team', env.team, '--dry-run']);
    assert.equal(dry.status, 0);
    const dryOut = JSON.parse(dry.stdout);
    assert.equal(dryOut.dryRun, true);
    assert.equal(dryOut.results.find(r => r.agent === 'main').changed, true);
    assert.equal(fs.readFileSync(mainAgents, 'utf8'), '# 총괄\n');
    assert.equal(fs.existsSync(path.join(env.researcher, 'AGENTS.md')), false);

    const out = JSON.parse(hook(['--team', env.team]).stdout);
    const mainResult = out.results.find(r => r.agent === 'main');
    assert.ok(mainResult.backup, 'backup path reported');
    assert.equal(fs.readFileSync(mainResult.backup, 'utf8'), '# 총괄\n');
    assert.equal(out.results.find(r => r.agent === 'researcher').backup, null, 'new file needs no backup');
  } finally { env.cleanup(); }
});

test('accepts { agents: [...] }, picks main by workspace when no isDefault, skips missing workspaces', () => {
  const env = setup();
  try {
    const team = path.join(env.root, 'team-wrapped.json');
    const ghost = path.join(env.root, 'ghost');
    fs.writeFileSync(team, JSON.stringify({ agents: [
      { id: 'main', workspace: env.main },
      { id: 'researcher', workspace: env.researcher },
      { id: 'ghost', workspace: ghost },
    ] }));
    const r = hook(['--team', team]);
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.results.find(x => x.agent === 'ghost').skipped, 'workspace missing');
    assert.equal(fs.existsSync(ghost), false);
    assert.match(fs.readFileSync(path.join(env.main, 'AGENTS.md'), 'utf8'), /총괄은 매일 22:00/);
    assert.doesNotMatch(fs.readFileSync(path.join(env.researcher, 'AGENTS.md'), 'utf8'), /총괄은 매일 22:00/);
  } finally { env.cleanup(); }
});

test('--workspace installs the main hook into one folder; exactly one target option is required', () => {
  const env = setup();
  try {
    assert.equal(hook(['--workspace', env.main]).status, 0);
    assert.match(fs.readFileSync(path.join(env.main, 'AGENTS.md'), 'utf8'), /총괄은 매일 22:00/);
    assert.equal(hook([]).status, 1);
    assert.equal(hook(['--workspace', env.main, '--team', env.team]).status, 1);
    assert.equal(hook(['--bogus']).status, 1);
  } finally { env.cleanup(); }
});

test('member hook tells agents to note "방금 그거 기억해" as a correction', () => {
  const env = setup();
  try {
    assert.equal(hook(['--team', env.team]).status, 0);
    assert.match(fs.readFileSync(path.join(env.researcher, 'AGENTS.md'), 'utf8'), /"방금 그거 기억해"라고 하면 교정으로 메모한다/);
  } finally { env.cleanup(); }
});

test('start marker without end marker: reports an error for that agent, leaves the file alone, exits 1 (install and --remove)', () => {
  const env = setup();
  try {
    const broken = '# 리서처\n<!-- self-improve-hook:start -->\n반쯤 지워진 구역\n';
    fs.writeFileSync(path.join(env.researcher, 'AGENTS.md'), broken);
    for (const args of [['--team', env.team], ['--team', env.team, '--remove']]) {
      const r = hook(args);
      assert.equal(r.status, 1);
      const out = JSON.parse(r.stdout);
      const res = out.results.find(x => x.agent === 'researcher');
      assert.equal(res.error, 'end marker missing');
      assert.equal(res.changed, undefined);
      assert.equal(fs.readFileSync(path.join(env.researcher, 'AGENTS.md'), 'utf8'), broken);
      assert.equal(out.results.find(x => x.agent === 'main').error, undefined, 'other agents still processed');
    }
  } finally { env.cleanup(); }
});

test('warns when no agent is recognised as main', () => {
  const env = setup();
  try {
    const team = path.join(env.root, 'team-nomain.json');
    fs.writeFileSync(team, JSON.stringify([{ id: 'boss', workspace: env.main }, { id: 'researcher', workspace: env.researcher }]));
    const r = hook(['--team', team]);
    assert.equal(r.status, 0);
    assert.match(JSON.parse(r.stdout).warning, /main/);
    const ok = JSON.parse(hook(['--team', env.team]).stdout);
    assert.equal(ok.warning, undefined);
  } finally { env.cleanup(); }
});
