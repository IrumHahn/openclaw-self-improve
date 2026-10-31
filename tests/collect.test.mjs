import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { EVENING, note, propose, run, runJson, setup } from './helpers.mjs';

const collect = (env, now = EVENING) => runJson('collect.mjs', ['--workspace', env.main, '--team', env.team, '--now', now]);

test('groups notes across team by key and applies kind thresholds', () => {
  const env = setup();
  try {
    note(env.researcher, 'researcher', 'correction', 'news-3-items', '뉴스는 3건만', 'skill:news-brief');
    note(env.main, 'main', 'failure', 'gmail-attach-10mb', '첨부 10MB 넘으면 실패', 'TOOLS.md');
    note(env.researcher, 'researcher', 'failure', 'gmail-attach-10mb', '첨부 10MB 이하로', 'TOOLS.md');
    note(env.main, 'main', 'repeat_task', 'weekly-sales', '주간 매출 정리', 'new-skill');
    note(env.main, 'main', 'user_trait', 'numbers-first', '숫자 근거부터 본다', 'USER.md');
    note(env.main, 'main', 'wish', 'kakao-summary', '단톡방 요약', 'new-skill');
    const out = collect(env);
    assert.equal(out.slots, 3);
    assert.deepEqual(out.missing, []);
    const byKey = Object.fromEntries(out.groups.map(g => [g.key, g]));
    assert.equal(byKey['news-3-items'].eligible, true);
    assert.deepEqual(byKey['news-3-items'].agents, ['researcher']);
    assert.equal(byKey['gmail-attach-10mb'].eligible, true);
    assert.equal(byKey['gmail-attach-10mb'].count, 2);
    assert.deepEqual(byKey['gmail-attach-10mb'].agents.sort(), ['main', 'researcher']);
    assert.equal(byKey['weekly-sales'].reason, 'below');
    assert.equal(byKey['numbers-first'].reason, 'below');
    assert.equal(byKey['kakao-summary'].reason, 'wish');
    assert.deepEqual(out.groups.slice(0, 2).map(g => g.key), ['news-3-items', 'gmail-attach-10mb']);
  } finally { env.cleanup(); }
});

test('pending key, cooldown, processed notes and daily cap', () => {
  const env = setup();
  try {
    const n = note(env.main, 'main', 'correction', 'report-3line', '보고는 3줄 요약부터', 'AGENTS.md');
    const t = note(env.main, 'main', 'correction', 'tone-polite', '존댓말로', 'SOUL.md');
    propose(env, { type: 'append', agent: 'main', key: 'tone-polite', kind: 'correction', reason: '말투를 고쳐 주셨어요', file: 'SOUL.md', line: '존댓말로 말한다', noteIds: [t.id] });
    let out = collect(env);
    assert.equal(out.slots, 2);
    assert.equal(out.groups.find(g => g.key === 'report-3line').eligible, true);
    assert.equal(out.groups.find(g => g.key === 'tone-polite'), undefined, 'processed notes disappear');
    propose(env, { type: 'append', agent: 'main', key: 'report-3line', kind: 'correction', reason: 'r', file: 'AGENTS.md', line: '보고는 3줄 요약부터', noteIds: [n.id] });
    note(env.main, 'main', 'correction', 'report-3line', '또 3줄 요약', 'AGENTS.md');
    out = collect(env);
    assert.equal(out.groups.find(g => g.key === 'report-3line').reason, 'pending');
  } finally { env.cleanup(); }
});

test('missing teammate workspace is reported, not fatal; sections near full listed', () => {
  const env = setup();
  try {
    const team = JSON.parse(fs.readFileSync(env.team, 'utf8'));
    team.push({ id: 'ghost', workspace: path.join(env.root, 'nope') });
    fs.writeFileSync(env.team, JSON.stringify(team));
    const rules = Array.from({ length: 26 }, (_, i) => `- 규칙 ${i}`).join('\n');
    fs.writeFileSync(path.join(env.main, 'AGENTS.md'), `# A\n<!-- self-improve:start -->\n## 성장 노트 — 배운 규칙\n${rules}\n<!-- self-improve:end -->\n`);
    const out = collect(env);
    assert.deepEqual(out.missing, ['ghost']);
    assert.deepEqual(out.sections, [{ agent: 'main', file: 'AGENTS.md', lines: 26 }]);
  } finally { env.cleanup(); }
});

test('broken state file fails closed', () => {
  const env = setup();
  try {
    fs.mkdirSync(path.join(env.main, 'learnings'), { recursive: true });
    fs.writeFileSync(path.join(env.main, 'learnings', 'state.json'), '{oops');
    assert.notEqual(run('collect.mjs', ['--workspace', env.main, '--team', env.team]).status, 0);
  } finally { env.cleanup(); }
});

test('corrupt notes line, corrupt pending file and missing end marker do not break collect', () => {
  const env = setup();
  try {
    note(env.researcher, 'researcher', 'correction', 'news-3-items', '뉴스는 3건만', 'skill:news-brief');
    fs.appendFileSync(path.join(env.researcher, 'learnings', 'notes.jsonl'), '{broken\n');
    note(env.main, 'main', 'correction', 'report-3line', '보고는 3줄 요약부터', 'AGENTS.md');
    fs.mkdirSync(path.join(env.main, 'learnings', 'pending'), { recursive: true });
    fs.writeFileSync(path.join(env.main, 'learnings', 'pending', 'p-20261102-aaaaaa.json'), '{oops');
    fs.writeFileSync(path.join(env.main, 'learnings', 'pending', 'p-20261102-bbbbbb.json'), JSON.stringify({ id: 'p-20261102-bbbbbb' }));
    fs.writeFileSync(path.join(env.main, 'TOOLS.md'), '# T\n<!-- self-improve:start -->\n- a\n');
    const out = collect(env);
    assert.deepEqual(out.skipped, [{ agent: 'researcher', file: 'notes.jsonl', lines: [2] }]);
    assert.deepEqual(out.brokenPending, ['p-20261102-aaaaaa.json', 'p-20261102-bbbbbb.json']);
    assert.deepEqual(out.sections, [{ agent: 'main', file: 'TOOLS.md', error: 'end marker missing' }]);
    assert.deepEqual(out.groups.map(g => g.key).sort(), ['news-3-items', 'report-3line']);
  } finally { env.cleanup(); }
});

test('collect: a broken ledger line stops with Korean recovery guidance', () => {
  const env = setup();
  try {
    fs.mkdirSync(path.join(env.main, 'learnings'), { recursive: true });
    fs.writeFileSync(path.join(env.main, 'learnings', 'ledger.jsonl'), '{"at":"2026-11-02T10:00:00+09:00","action":"proposed"}\n{깨짐\n');
    const r = run('collect.mjs', ['--workspace', env.main, '--team', env.team, '--now', EVENING]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /장부\(ledger\.jsonl\) 2번째 줄이 망가졌어요\. 그 줄을 지우면 다시 돌아가요/);
  } finally { env.cleanup(); }
});
