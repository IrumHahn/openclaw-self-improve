import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { message, propose, run, runJson, setup } from './helpers.mjs';

const NOW = '2026-11-03T09:00:00+09:00';
const applyN = (env, n) => runJson('apply.mjs', ['--workspace', env.main, '--number', n, '--now', '2026-11-02T22:10:00+09:00']);
const rollback = (env, args) => run('rollback.mjs', ['--workspace', env.main, '--now', NOW, ...args]);

test('rollback restores original; file created by append is moved to archive, not deleted', () => {
  const env = setup();
  try {
    const agents = path.join(env.main, 'AGENTS.md');
    fs.writeFileSync(agents, '원본\n');
    propose(env, { type: 'append', agent: 'main', key: 'a-1', kind: 'correction', reason: 'r', file: 'AGENTS.md', line: 'x' }, '2026-11-02T21:00:00+09:00');
    propose(env, { type: 'append', agent: 'main', key: 'a-2', kind: 'correction', reason: 'r', file: 'TOOLS.md', line: 'y' }, '2026-11-02T21:01:00+09:00');
    message(env);
    applyN(env, '1'); applyN(env, '2');
    const r1 = rollback(env, ['--number', '1']);
    assert.equal(r1.status, 0, r1.stderr);
    assert.equal(JSON.parse(r1.stdout).message, '되돌렸어요 — 업무 규칙 · 총괄.');
    assert.equal(fs.readFileSync(agents, 'utf8'), '원본\n');
    assert.equal(rollback(env, ['--number', '2']).status, 0);
    assert.equal(fs.existsSync(path.join(env.main, 'TOOLS.md')), false);
    assert.equal(fs.readdirSync(path.join(env.main, 'learnings', 'archive', 'rolled-back')).length, 1);
    assert.notEqual(rollback(env, ['--number', '1']).status, 0, 'cannot roll back twice');
  } finally { env.cleanup(); }
});

test('rollback refuses when the file changed after apply (exit 2 with diff), --force overrides', () => {
  const env = setup();
  try {
    const agents = path.join(env.main, 'AGENTS.md');
    fs.writeFileSync(agents, '원본\n');
    propose(env, { type: 'append', agent: 'main', key: 'a-1', kind: 'correction', reason: 'r', file: 'AGENTS.md', line: 'x' });
    message(env);
    applyN(env, '1');
    fs.appendFileSync(agents, '학생이 나중에 쓴 줄\n');
    const r = rollback(env, ['--number', '1']);
    assert.equal(r.status, 2);
    const out = JSON.parse(r.stdout);
    assert.equal(out.conflict, true);
    assert.deepEqual(out.addedSinceApply, ['학생이 나중에 쓴 줄']);
    assert.equal(rollback(env, ['--number', '1', '--force']).status, 0);
    assert.equal(fs.readFileSync(agents, 'utf8'), '원본\n');
    const saved = fs.readdirSync(path.join(env.main, 'learnings', 'backups'))[0];
    assert.match(fs.readFileSync(path.join(env.main, 'learnings', 'backups', saved, 'before-rollback'), 'utf8'), /학생이 나중에 쓴 줄/);
  } finally { env.cleanup(); }
});

test('rollback of a new skill moves the skill folder to archive', () => {
  const env = setup();
  try {
    const md = '---\nname: weekly-sales\ndescription: "(시험판) 주간"\n---\n';
    propose(env, { type: 'new_skill', agent: 'main', key: 'weekly-sales', kind: 'repeat_task', reason: 'r', skillName: 'weekly-sales', summary: 's', skillMd: md });
    message(env);
    applyN(env, '1');
    assert.equal(rollback(env, ['--number', '1']).status, 0);
    assert.equal(fs.existsSync(path.join(env.main, 'skills', 'weekly-sales')), false);
    assert.ok(fs.readdirSync(path.join(env.main, 'learnings', 'archive', 'rolled-back'))[0].endsWith('-weekly-sales'));
  } finally { env.cleanup(); }
});

test('a broken ledger line stops rollback with recovery guidance and leaves the file alone', () => {
  const env = setup();
  try {
    const agents = path.join(env.main, 'AGENTS.md');
    fs.writeFileSync(agents, '원본\n');
    propose(env, { type: 'append', agent: 'main', key: 'a-1', kind: 'correction', reason: 'r', file: 'AGENTS.md', line: 'x' });
    message(env);
    applyN(env, '1');
    const applied = fs.readFileSync(agents, 'utf8');
    fs.appendFileSync(path.join(env.main, 'learnings', 'ledger.jsonl'), '{망가짐\n');
    const r = rollback(env, ['--number', '1']);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /장부\(ledger\.jsonl\) 3번째 줄이 망가졌어요\. 그 줄을 지우면 다시 돌아가요/);
    assert.equal(fs.readFileSync(agents, 'utf8'), applied);
  } finally { env.cleanup(); }
});

const backupsDir = env => path.join(env.main, 'learnings', 'backups');
const archivedBackups = env => path.join(env.main, 'learnings', 'archive', 'backups');

test('rollback still works after maintain moved the backups to archive/backups/<id>', () => {
  const env = setup();
  try {
    const agents = path.join(env.main, 'AGENTS.md');
    fs.writeFileSync(agents, '원본\n');
    const p = propose(env, { type: 'append', agent: 'main', key: 'a-1', kind: 'correction', reason: 'r', file: 'AGENTS.md', line: 'x' });
    message(env);
    applyN(env, '1');
    const out = runJson('maintain.mjs', ['--workspace', env.main, '--team', env.team, '--now', '2026-12-20T22:00:00+09:00']);
    assert.equal(out.archivedBackups, 1);
    assert.equal(fs.existsSync(path.join(backupsDir(env), p.id)), false);
    const r = rollback(env, ['--number', '1']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(fs.readFileSync(agents, 'utf8'), '원본\n');
    assert.ok(fs.existsSync(path.join(archivedBackups(env), p.id, 'before-rollback')));
  } finally { env.cleanup(); }
});

test('rollback with the backup gone (both places) says so in plain Korean, exit 1, and changes nothing', () => {
  const env = setup();
  try {
    const agents = path.join(env.main, 'AGENTS.md');
    fs.writeFileSync(agents, '원본\n');
    propose(env, { type: 'append', agent: 'main', key: 'a-1', kind: 'correction', reason: 'r', file: 'AGENTS.md', line: 'x' });
    message(env);
    applyN(env, '1');
    const applied = fs.readFileSync(agents, 'utf8');
    fs.rmSync(backupsDir(env), { recursive: true });
    const r = rollback(env, ['--number', '1']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /되돌릴 원본을 찾을 수 없어요\. 새 수정 제안으로 고칠게요/);
    assert.equal(fs.readFileSync(agents, 'utf8'), applied);
    // 충돌 경로(applied 파일 필요)도 같은 문구
    fs.appendFileSync(agents, '학생 줄\n');
    const conflict = rollback(env, ['--number', '1']);
    assert.equal(conflict.status, 1);
    assert.match(conflict.stderr, /되돌릴 원본을 찾을 수 없어요/);
  } finally { env.cleanup(); }
});

test('new_skill rollback: changed SKILL.md or extra files => exit 2 conflict, --force archives the whole folder', () => {
  const env = setup();
  try {
    const md = '---\nname: weekly-sales\ndescription: "(시험판) 주간"\n---\n본문\n';
    propose(env, { type: 'new_skill', agent: 'main', key: 'weekly-sales', kind: 'repeat_task', reason: 'r', skillName: 'weekly-sales', summary: 's', skillMd: md });
    message(env);
    applyN(env, '1');
    const dir = path.join(env.main, 'skills', 'weekly-sales');
    fs.appendFileSync(path.join(dir, 'SKILL.md'), '학생이 고친 줄\n');
    const edited = rollback(env, ['--number', '1']);
    assert.equal(edited.status, 2);
    const out = JSON.parse(edited.stdout);
    assert.equal(out.conflict, true);
    assert.deepEqual(out.addedSinceApply, ['학생이 고친 줄']);
    assert.equal(fs.existsSync(dir), true);

    fs.writeFileSync(path.join(dir, 'SKILL.md'), md);
    fs.mkdirSync(path.join(dir, 'references'));
    fs.writeFileSync(path.join(dir, 'references', 'a.md'), '자료');
    const extra = rollback(env, ['--number', '1']);
    assert.equal(extra.status, 2);
    assert.deepEqual(JSON.parse(extra.stdout).addedFiles, ['references/a.md']);

    assert.equal(rollback(env, ['--number', '1', '--force']).status, 0);
    assert.equal(fs.existsSync(dir), false);
    const archived = path.join(env.main, 'learnings', 'archive', 'rolled-back');
    const moved = path.join(archived, fs.readdirSync(archived)[0]);
    assert.ok(fs.existsSync(path.join(moved, 'references', 'a.md')));
  } finally { env.cleanup(); }
});

test('--last rolls back the most recently applied proposal, then the one before it', () => {
  const env = setup();
  try {
    const agents = path.join(env.main, 'AGENTS.md');
    const tools = path.join(env.main, 'TOOLS.md');
    fs.writeFileSync(agents, '원본A\n'); fs.writeFileSync(tools, '원본T\n');
    propose(env, { type: 'append', agent: 'main', key: 'a-1', kind: 'correction', reason: 'r', file: 'AGENTS.md', line: 'x' }, '2026-11-02T21:00:00+09:00');
    propose(env, { type: 'append', agent: 'main', key: 'a-2', kind: 'correction', reason: 'r', file: 'TOOLS.md', line: 'y' }, '2026-11-02T21:01:00+09:00');
    message(env);
    applyN(env, '1'); applyN(env, '2');
    assert.equal(rollback(env, ['--last']).status, 0);
    assert.equal(fs.readFileSync(tools, 'utf8'), '원본T\n');
    assert.notEqual(fs.readFileSync(agents, 'utf8'), '원본A\n');
    assert.equal(rollback(env, ['--last']).status, 0);
    assert.equal(fs.readFileSync(agents, 'utf8'), '원본A\n');
    const none = rollback(env, ['--last']);
    assert.notEqual(none.status, 0);
    assert.match(none.stderr, /되돌릴 수 있는 반영 기록이 없어요/);
  } finally { env.cleanup(); }
});
