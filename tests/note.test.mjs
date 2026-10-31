import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { redact } from '../skill/self-improve/scripts/lib/redact.mjs';
import { note, run, runJson, setup, T0 } from './helpers.mjs';

test('redact hides tokens, emails, phones, cards, password values', () => {
  const cases = [
    ['키는 sk-abcdefghijklmnop1234 이다', '키는 [가림] 이다'],
    ['ghp_ABCDEFGHIJKLMNOPQRSTUV12 사용', '[가림] 사용'],
    ['Authorization: Bearer abc.def.ghi123456', 'Authorization: [가림]'],
    ['메일 hong@example.com 로', '메일 [가림] 로'],
    ['전화 010-1234-5678 로', '전화 [가림] 로'],
    ['카드 1234-5678-9012-3456', '카드 [가림]'],
    ['password=hunter2 입력', 'password=[가림] 입력'],
    ['비밀번호: 1234abcd', '비밀번호=[가림]'],
    ['토큰 a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7 끝', '토큰 [가림] 끝'],
  ];
  cases.push(['id weekly-sales-report-2026-summary-v2 유지', 'id weekly-sales-report-2026-summary-v2 유지']);
  cases.push(['토큰 aB3dE5fG7hJ9kL1m-N3pQ5rS7tU9vW1xY3zz 끝', '토큰 [가림] 끝']); // base64url 비밀은 하이픈이 있어도 가린다
  cases.push(['긴 id abcdefghijklmnopqrstuvwx-yz0123456789abcd 가림', '긴 id [가림] 가림']); // 한 토막이 16자 이상이면 식별자로 보지 않는다
  for (const [input, expected] of cases) assert.equal(redact(input).text, expected, input);
  assert.deepEqual(redact('보고는 3줄 요약부터'), { text: '보고는 3줄 요약부터', redacted: false });
});

test('note appends one validated line with KST ts and reports redaction', () => {
  const env = setup();
  try {
    const out = note(env.researcher, 'researcher', 'correction', 'report-3line-summary', '보고는 3줄 요약부터 시작한다', 'AGENTS.md', T0, ['--evidence', '주인 메일 hong@example.com 에서']);
    assert.equal(out.saved, true);
    assert.equal(out.redacted, true);
    const lines = fs.readFileSync(path.join(env.researcher, 'learnings', 'notes.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].id, out.id);
    assert.equal(lines[0].ts, '2026-11-02T10:00:00+09:00');
    assert.equal(lines[0].evidence, '주인 메일 [가림] 에서');
    assert.equal(lines[0].kind, 'correction');
  } finally { env.cleanup(); }
});

test('note rejects bad kind, key, target, long lesson', () => {
  const env = setup();
  try {
    const base = ['--workspace', env.main, '--agent', 'main', '--now', T0];
    const bad = [
      ['--kind', 'mood', '--key', 'a-b', '--lesson', 'x', '--target', 'AGENTS.md'],
      ['--kind', 'failure', '--key', 'Bad Key', '--lesson', 'x', '--target', 'AGENTS.md'],
      ['--kind', 'failure', '--key', 'a-b', '--lesson', 'x', '--target', 'openclaw.json'],
      ['--kind', 'failure', '--key', 'a-b', '--lesson', 'x'.repeat(201), '--target', 'AGENTS.md'],
    ];
    for (const args of bad) assert.notEqual(run('note.mjs', [...base, ...args]).status, 0, args.join(' '));
    assert.equal(fs.existsSync(path.join(env.main, 'learnings', 'notes.jsonl')), false);
  } finally { env.cleanup(); }
});

test('--list-keys groups existing keys with counts', () => {
  const env = setup();
  try {
    note(env.main, 'main', 'failure', 'gmail-attach-10mb', '첨부 10MB 넘으면 실패', 'TOOLS.md');
    note(env.main, 'main', 'failure', 'gmail-attach-10mb', 'Gmail 첨부는 10MB 이하로', 'TOOLS.md');
    note(env.main, 'main', 'wish', 'kakao-summary', '단톡방 요약', 'new-skill');
    const keys = runJson('note.mjs', ['--workspace', env.main, '--list-keys']);
    assert.deepEqual(keys.map(k => [k.key, k.count]), [['gmail-attach-10mb', 2], ['kakao-summary', 1]]);
    assert.equal(keys[0].lesson, 'Gmail 첨부는 10MB 이하로');
  } finally { env.cleanup(); }
});

test('--list-keys skips broken lines instead of failing', () => {
  const env = setup();
  try {
    note(env.main, 'main', 'failure', 'gmail-attach-10mb', '첨부 10MB 넘으면 실패', 'TOOLS.md');
    fs.appendFileSync(path.join(env.main, 'learnings', 'notes.jsonl'), '{broken\n');
    const keys = runJson('note.mjs', ['--workspace', env.main, '--list-keys']);
    assert.deepEqual(keys.map(k => k.key), ['gmail-attach-10mb']);
  } finally { env.cleanup(); }
});

test('--list-keys ignores records that are not objects or have no string key', () => {
  const env = setup();
  try {
    note(env.main, 'main', 'failure', 'gmail-attach-10mb', '첨부 10MB 넘으면 실패', 'TOOLS.md');
    fs.appendFileSync(path.join(env.main, 'learnings', 'notes.jsonl'), 'null\n42\n"text"\n[1]\n{"kind":"failure"}\n{"key":7}\n');
    const keys = runJson('note.mjs', ['--workspace', env.main, '--list-keys']);
    assert.deepEqual(keys.map(k => k.key), ['gmail-attach-10mb']);
  } finally { env.cleanup(); }
});
