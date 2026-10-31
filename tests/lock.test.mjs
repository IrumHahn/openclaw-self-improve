import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { EVENING, message, propose, run, runOk, setup, writeProposal } from './helpers.mjs';

const lockFile = env => path.join(env.main, 'learnings', '.lock');
function makeLock(env, ageMs = 0) {
  fs.mkdirSync(path.join(env.main, 'learnings'), { recursive: true });
  fs.writeFileSync(lockFile(env), '999\n');
  const at = new Date(Date.now() - ageMs);
  fs.utimesSync(lockFile(env), at, at);
}
const BODY = { type: 'append', agent: 'main', key: 'lock-a', kind: 'correction', reason: 'r', file: 'AGENTS.md', line: '규칙' };

// 잠금을 쓰는 다섯 스크립트. 각각 (env) => 실행 결과
function commands(env, id) {
  return {
    propose: () => run('propose.mjs', ['--workspace', env.main, '--team', env.team, '--file', writeProposal(env, { ...BODY, key: 'lock-b' }), '--now', EVENING]),
    apply: () => run('apply.mjs', ['--workspace', env.main, '--id', id, '--now', EVENING]),
    reject: () => run('reject.mjs', ['--workspace', env.main, '--id', id, '--now', EVENING]),
    rollback: () => run('rollback.mjs', ['--workspace', env.main, '--id', id, '--now', EVENING]),
    maintain: () => run('maintain.mjs', ['--workspace', env.main, '--team', env.team, '--now', EVENING]),
  };
}

test('a fresh lock makes propose/apply/reject/rollback/maintain exit 5 with a plain Korean message and change nothing', () => {
  const env = setup();
  try {
    const first = propose(env, BODY);
    makeLock(env, 60 * 1000);
    for (const [name, go] of Object.entries(commands(env, first.id))) {
      const r = go();
      assert.equal(r.status, 5, `${name}: ${r.stderr}`);
      assert.match(r.stderr, /다른 정리 작업이 진행 중이에요\. 잠시 뒤 다시 해 주세요/);
    }
    assert.equal(fs.existsSync(path.join(env.main, 'AGENTS.md')), false);
    assert.equal(fs.existsSync(lockFile(env)), true, 'someone else\'s lock is left alone');
  } finally { env.cleanup(); }
});

test('a lock older than 10 minutes is treated as left behind: the command proceeds and releases the lock', () => {
  const env = setup();
  try {
    const first = propose(env, BODY);
    message(env);
    makeLock(env, 11 * 60 * 1000);
    const r = commands(env, first.id).apply();
    assert.equal(r.status, 0, r.stderr);
    assert.match(fs.readFileSync(path.join(env.main, 'AGENTS.md'), 'utf8'), /- 규칙/);
    assert.equal(fs.existsSync(lockFile(env)), false);
    assert.equal(runOk('maintain.mjs', ['--workspace', env.main, '--team', env.team, '--now', EVENING]).includes('expired'), true);
    assert.equal(fs.existsSync(lockFile(env)), false);
  } finally { env.cleanup(); }
});

test('the lock is released even when the command fails', () => {
  const env = setup();
  try {
    const r = run('apply.mjs', ['--workspace', env.main, '--id', 'p-20261102-abcdef', '--now', EVENING]);
    assert.notEqual(r.status, 0);
    assert.equal(fs.existsSync(lockFile(env)), false);
  } finally { env.cleanup(); }
});

test('status --message also takes the lock (fresh lock => exit 5, state untouched)', () => {
  const env = setup();
  try {
    propose(env, BODY);
    makeLock(env, 60 * 1000);
    const r = run('status.mjs', ['--workspace', env.main, '--team', env.team, '--message', '--now', EVENING]);
    assert.equal(r.status, 5);
    assert.match(r.stderr, /다른 정리 작업이 진행 중이에요/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(env.main, 'learnings', 'state.json'), 'utf8')).lastMessage, null);
  } finally { env.cleanup(); }
});
