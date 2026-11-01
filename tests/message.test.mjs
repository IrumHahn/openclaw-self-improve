import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { EVENING, message, propose, runOk, setup } from './helpers.mjs';

test('no pending → empty output', () => {
  const env = setup();
  try { assert.equal(message(env), ''); } finally { env.cleanup(); }
});

test('evening message numbers pending proposals in plain Korean and saves the number map', () => {
  const env = setup();
  try {
    fs.mkdirSync(path.join(env.researcher, 'skills', 'news-brief'), { recursive: true });
    fs.writeFileSync(path.join(env.researcher, 'skills', 'news-brief', 'SKILL.md'), '기사 5건을 요약한다\n');
    const a = propose(env, { type: 'replace', agent: 'researcher', key: 'news-3', kind: 'correction', reason: '이번 주 2번 고쳐 주셨어요', file: 'skills/news-brief/SKILL.md', old: '기사 5건을 요약한다', new: '기사 3건을 요약하고 출처 링크를 붙인다' }, '2026-11-02T21:00:00+09:00');
    const b = propose(env, { type: 'append', agent: 'main', key: 'numbers-first', kind: 'user_trait', reason: '보고서마다 숫자부터 물어보셨어요', file: 'USER.md', line: '보고서를 받으면 숫자 근거부터 확인하신다' }, '2026-11-02T21:01:00+09:00');
    const text = message(env);
    assert.equal(text, [
      '🌱 성장 노트 — 오늘 개선 제안 2건',
      '',
      "1) [news-brief 스킬 · 팀원 'researcher']",
      '   전: "기사 5건을 요약한다"',
      '   후: "기사 3건을 요약하고 출처 링크를 붙인다"',
      '   이유: 이번 주 2번 고쳐 주셨어요',
      '',
      '2) [대표님에 대해 · 추정 · 총괄]',
      '   "보고서를 받으면 숫자 근거부터 확인하신다"',
      '   이렇게 짐작했는데 맞나요?',
      '   이유: 보고서마다 숫자부터 물어보셨어요',
      '',
      '답장: "1 승인" · "2 거절" · "전부 승인" · "1 나중에"',
      '',
    ].join('\n'));
    const state = JSON.parse(fs.readFileSync(path.join(env.main, 'learnings', 'state.json'), 'utf8'));
    assert.deepEqual(state.lastMessage.map, { 1: a.id, 2: b.id });
  } finally { env.cleanup(); }
});

test('--show prints the full new-skill draft', () => {
  const env = setup();
  try {
    const md = '---\nname: weekly-sales\ndescription: "(시험판) 주간 매출"\n---\n\n# 주간 매출 정리\n';
    propose(env, { type: 'new_skill', agent: 'main', key: 'weekly-sales', kind: 'repeat_task', reason: '3번 반복', skillName: 'weekly-sales', summary: '표 1장', skillMd: md });
    assert.match(message(env), /1\) \[새 스킬 제안 · 담당 총괄\]\n   weekly-sales — 표 1장\n   전체 초안: "1 보여 줘"/);
    assert.equal(runOk('status.mjs', ['--workspace', env.main, '--team', env.team, '--show', '1']), md);
  } finally { env.cleanup(); }
});

test('header says so when some proposals are from earlier days', () => {
  const env = setup();
  try {
    propose(env, { type: 'append', agent: 'main', key: 'k-old', kind: 'correction', reason: 'r', file: 'AGENTS.md', line: '어제 것' }, '2026-11-02T21:00:00+09:00');
    propose(env, { type: 'append', agent: 'main', key: 'k-new', kind: 'correction', reason: 'r', file: 'TOOLS.md', line: '오늘 것' }, '2026-11-03T21:00:00+09:00');
    assert.match(message(env, '2026-11-03T22:00:00+09:00'), /^🌱 성장 노트 — 개선 제안 2건 \(지난 제안 1건 포함\)\n\n1\) /);
    assert.match(message(env, '2026-11-02T22:00:00+09:00'), /^🌱 성장 노트 — 개선 제안 2건 \(지난 제안 1건 포함\)/, 'future-dated proposal also counts as not today');
  } finally { env.cleanup(); }
});

test('header is the plain "오늘" one when every pending proposal was created today (KST, even near midnight)', () => {
  const env = setup();
  try {
    propose(env, { type: 'append', agent: 'main', key: 'k-a', kind: 'correction', reason: 'r', file: 'AGENTS.md', line: 'a' }, '2026-11-02T00:10:00+09:00');
    assert.match(message(env, '2026-11-02T23:50:00+09:00'), /^🌱 성장 노트 — 오늘 개선 제안 1건\n/);
  } finally { env.cleanup(); }
});

test('section marker comment lines are hidden from the 전/후 display', () => {
  const env = setup();
  try {
    fs.writeFileSync(path.join(env.main, 'AGENTS.md'), '<!-- self-improve:start -->\n## 성장 노트 — 배운 규칙\n- 옛 규칙\n<!-- self-improve:end -->\n');
    propose(env, { type: 'replace', agent: 'main', key: 'k-a', kind: 'correction', reason: 'r', file: 'AGENTS.md', old: '<!-- self-improve:start -->\n## 성장 노트 — 배운 규칙\n- 옛 규칙\n', new: '<!-- self-improve:start -->\n## 성장 노트 — 배운 규칙\n- 새 규칙\n' });
    const text = message(env);
    assert.match(text, /   전: "## 성장 노트 — 배운 규칙 - 옛 규칙"\n   후: "## 성장 노트 — 배운 규칙 - 새 규칙"\n/);
    assert.equal(text.includes('self-improve:'), false);
    assert.equal(runOk('status.mjs', ['--workspace', env.main, '--team', env.team, '--show', '1']).includes('self-improve:'), false);
  } finally { env.cleanup(); }
});
