import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { note, propose, runJson, setup } from './helpers.mjs';

const maintain = (env, now) => runJson('maintain.mjs', ['--workspace', env.main, '--team', env.team, '--now', now]);

test('expires pending older than 7 days, keeps newer', () => {
  const env = setup();
  try {
    const old = propose(env, { type: 'append', agent: 'main', key: 'old-1', kind: 'correction', reason: 'r', file: 'AGENTS.md', line: 'a' }, '2026-11-01T22:00:00+09:00');
    const fresh = propose(env, { type: 'append', agent: 'main', key: 'new-1', kind: 'correction', reason: 'r', file: 'AGENTS.md', line: 'b' }, '2026-11-05T22:00:00+09:00');
    const out = maintain(env, '2026-11-08T22:30:00+09:00');
    assert.deepEqual(out.expired, [old.id]);
    const status = id => JSON.parse(fs.readFileSync(path.join(env.main, 'learnings', 'pending', `${id}.json`), 'utf8')).status;
    assert.equal(status(old.id), 'expired');
    assert.equal(status(fresh.id), 'pending');
  } finally { env.cleanup(); }
});

test('archives processed and wish notes older than 30 days in every workspace; keeps the rest', () => {
  const env = setup();
  try {
    const done = note(env.researcher, 'researcher', 'correction', 'k-done', 'a', 'AGENTS.md', '2026-10-01T10:00:00+09:00');
    note(env.researcher, 'researcher', 'wish', 'k-wish', 'b', 'new-skill', '2026-10-01T10:00:00+09:00');
    note(env.researcher, 'researcher', 'failure', 'k-open', 'c', 'TOOLS.md', '2026-10-01T10:00:00+09:00');
    const closed = propose(env, { type: 'append', agent: 'researcher', key: 'k-done', kind: 'correction', reason: 'r', file: 'AGENTS.md', line: 'a', noteIds: [done.id] }, '2026-10-01T22:00:00+09:00');
    // 거절된 제안의 메모는 처리된 채로 남는다(만료된 제안의 메모는 풀려서 보관되지 않는다).
    runJson('reject.mjs', ['--workspace', env.main, '--id', closed.id, '--now', '2026-10-02T09:00:00+09:00']);
    const out = maintain(env, '2026-11-02T22:30:00+09:00');
    assert.equal(out.archivedNotes, 2);
    const left = fs.readFileSync(path.join(env.researcher, 'learnings', 'notes.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.deepEqual(left.map(n => n.key), ['k-open']);
    assert.equal(fs.readFileSync(path.join(env.researcher, 'learnings', 'archive', 'notes-2026-10.jsonl'), 'utf8').trim().split('\n').length, 2);
    const state = JSON.parse(fs.readFileSync(path.join(env.main, 'learnings', 'state.json'), 'utf8'));
    assert.deepEqual(state.processed, []);
  } finally { env.cleanup(); }
});

test('a notes file with a broken line is not rewritten; it is reported in skipped and other workspaces still archive', () => {
  const env = setup();
  try {
    note(env.researcher, 'researcher', 'wish', 'k-wish', 'b', 'new-skill', '2026-10-01T10:00:00+09:00');
    note(env.main, 'main', 'wish', 'k-wish-2', 'c', 'new-skill', '2026-10-01T10:00:00+09:00');
    const file = path.join(env.researcher, 'learnings', 'notes.jsonl');
    fs.appendFileSync(file, '{깨진 줄\n');
    const before = fs.readFileSync(file, 'utf8');
    const out = maintain(env, '2026-11-02T22:30:00+09:00');
    assert.equal(fs.readFileSync(file, 'utf8'), before);
    assert.deepEqual(out.skipped, [{ agent: 'researcher', file: 'notes.jsonl', lines: [2] }]);
    assert.equal(out.archivedNotes, 1);
    assert.equal(fs.existsSync(path.join(env.researcher, 'learnings', 'archive')), false);
  } finally { env.cleanup(); }
});

test('expiry releases the proposal\'s notes so collect lists the group again; a rejection keeps its notes processed', () => {
  const env = setup();
  try {
    const n1 = note(env.main, 'main', 'correction', 'k-exp', 'a', 'AGENTS.md', '2026-11-01T10:00:00+09:00');
    const n2 = note(env.main, 'main', 'correction', 'k-rej', 'b', 'TOOLS.md', '2026-11-01T10:00:00+09:00');
    const expiring = propose(env, { type: 'append', agent: 'main', key: 'k-exp', kind: 'correction', reason: 'r', file: 'AGENTS.md', line: 'a', noteIds: [n1.id] }, '2026-11-01T22:00:00+09:00');
    const rejecting = propose(env, { type: 'append', agent: 'main', key: 'k-rej', kind: 'correction', reason: 'r', file: 'TOOLS.md', line: 'b', noteIds: [n2.id] }, '2026-11-07T22:00:00+09:00');
    const stateFile = path.join(env.main, 'learnings', 'state.json');
    assert.deepEqual(JSON.parse(fs.readFileSync(stateFile, 'utf8')).processed.sort(), [n1.id, n2.id].sort());
    runJson('reject.mjs', ['--workspace', env.main, '--id', rejecting.id, '--now', '2026-11-08T21:00:00+09:00']);
    const out = maintain(env, '2026-11-09T22:30:00+09:00');
    assert.deepEqual(out.expired, [expiring.id]);
    assert.deepEqual(JSON.parse(fs.readFileSync(stateFile, 'utf8')).processed, [n2.id]);
    const groups = runJson('collect.mjs', ['--workspace', env.main, '--team', env.team, '--now', '2026-11-09T23:00:00+09:00']).groups;
    assert.deepEqual(groups.map(g => [g.key, g.eligible]), [['k-exp', true]]);
  } finally { env.cleanup(); }
});
