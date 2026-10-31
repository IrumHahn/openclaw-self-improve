import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { EVENING, note, propose, run, setup, writeProposal } from './helpers.mjs';

const SKILL_MD = '---\nname: weekly-sales\ndescription: "(시험판) 주간 매출 정리. Use when ..."\n---\n\n# 주간 매출 정리\n1. 시트 3개를 읽는다\n';
const tryPropose = (env, body) => run('propose.mjs', ['--workspace', env.main, '--team', env.team, '--file', writeProposal(env, body), '--now', EVENING]);

test('append/replace/new_skill are stored as pending with base sha, ledger and processed notes', () => {
  const env = setup();
  try {
    const n = note(env.main, 'main', 'correction', 'report-3line', '보고는 3줄 요약부터', 'AGENTS.md');
    const a = propose(env, { type: 'append', agent: 'main', key: 'report-3line', kind: 'correction', reason: '고쳐 주셨어요', noteIds: [n.id], file: 'AGENTS.md', line: '보고는 3줄 요약부터 시작한다' });
    assert.match(a.id, /^p-20261102-[0-9a-f]{6}$/);
    const stored = JSON.parse(fs.readFileSync(path.join(env.main, 'learnings', 'pending', `${a.id}.json`), 'utf8'));
    assert.equal(stored.status, 'pending');
    assert.equal(stored.baseSha, 'absent');
    assert.equal(stored.workspace, env.main);

    fs.mkdirSync(path.join(env.researcher, 'skills', 'news-brief'), { recursive: true });
    fs.writeFileSync(path.join(env.researcher, 'skills', 'news-brief', 'SKILL.md'), '# 뉴스\n기사 5건을 요약한다\n');
    const r = propose(env, { type: 'replace', agent: 'researcher', key: 'news-3-items', kind: 'correction', reason: 'r', file: 'skills/news-brief/SKILL.md', old: '기사 5건을 요약한다', new: '기사 3건을 요약하고 출처 링크를 붙인다' });
    assert.ok(r.proposed);
    const s = propose(env, { type: 'new_skill', agent: 'researcher', key: 'weekly-sales', kind: 'repeat_task', reason: '3번 반복', skillName: 'weekly-sales', summary: '시트 3개를 표 1장으로', skillMd: SKILL_MD });
    assert.ok(s.proposed);

    const ledger = fs.readFileSync(path.join(env.main, 'learnings', 'ledger.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.deepEqual(ledger.map(e => e.action), ['proposed', 'proposed', 'proposed']);
    const state = JSON.parse(fs.readFileSync(path.join(env.main, 'learnings', 'state.json'), 'utf8'));
    assert.deepEqual(state.processed, [n.id]);
  } finally { env.cleanup(); }
});

test('propose rejects: unknown agent, append to skill file, old not exactly once, duplicate pending key, bad skill draft, existing skill', () => {
  const env = setup();
  try {
    fs.writeFileSync(path.join(env.main, 'AGENTS.md'), '같은 문장\n같은 문장\n');
    const base = { kind: 'correction', reason: 'r' };
    const cases = [
      { ...base, type: 'append', agent: 'ghost', key: 'k-a', file: 'AGENTS.md', line: 'x' },
      { ...base, type: 'append', agent: 'main', key: 'k-b', file: 'skills/x/SKILL.md', line: 'x' },
      { ...base, type: 'replace', agent: 'main', key: 'k-c', file: 'AGENTS.md', old: '같은 문장', new: '다른 문장' },
      { ...base, type: 'replace', agent: 'main', key: 'k-d', file: 'AGENTS.md', old: '없는 문장', new: '다른 문장' },
      { ...base, type: 'new_skill', agent: 'main', key: 'k-e', skillName: 'weekly-sales', summary: 's', skillMd: SKILL_MD.replace('(시험판) ', '') },
      { ...base, type: 'new_skill', agent: 'main', key: 'k-f', skillName: 'other-name', summary: 's', skillMd: SKILL_MD },
      { ...base, type: 'append', agent: 'main', key: 'k-g', file: 'openclaw.json', line: 'x' },
    ];
    for (const body of cases) assert.notEqual(tryPropose(env, body).status, 0, JSON.stringify(body));
    propose(env, { ...base, type: 'append', agent: 'main', key: 'k-h', file: 'TOOLS.md', line: 'x' });
    assert.notEqual(tryPropose(env, { ...base, type: 'append', agent: 'main', key: 'k-h', file: 'TOOLS.md', line: 'y' }).status, 0);
    fs.mkdirSync(path.join(env.main, 'skills', 'weekly-sales'), { recursive: true });
    assert.notEqual(tryPropose(env, { ...base, type: 'new_skill', agent: 'main', key: 'k-i', skillName: 'weekly-sales', summary: 's', skillMd: SKILL_MD }).status, 0);
  } finally { env.cleanup(); }
});

test('daily cap: the 4th proposal on the same KST day is refused (exit 3), next day is fine', () => {
  const env = setup();
  try {
    for (const key of ['c-1', 'c-2', 'c-3']) propose(env, { type: 'append', agent: 'main', key, kind: 'correction', reason: 'r', file: 'AGENTS.md', line: key });
    const fourth = tryPropose(env, { type: 'append', agent: 'main', key: 'c-4', kind: 'correction', reason: 'r', file: 'AGENTS.md', line: 'c-4' });
    assert.equal(fourth.status, 3);
    assert.ok(propose(env, { type: 'append', agent: 'main', key: 'c-4', kind: 'correction', reason: 'r', file: 'AGENTS.md', line: 'c-4' }, '2026-11-03T22:00:00+09:00').proposed);
  } finally { env.cleanup(); }
});

test('cooldown from state.json blocks re-proposing the same key (exit 3) until it expires', () => {
  const env = setup();
  try {
    fs.mkdirSync(path.join(env.main, 'learnings'), { recursive: true });
    fs.writeFileSync(path.join(env.main, 'learnings', 'state.json'), JSON.stringify({ version: 1, processed: [], cooldowns: { 'tone-polite': '2026-11-10T00:00:00+09:00' }, lastMessage: null }));
    const body = { type: 'append', agent: 'main', key: 'tone-polite', kind: 'correction', reason: 'r', file: 'SOUL.md', line: '존댓말로 말한다' };
    const blocked = tryPropose(env, body);
    assert.equal(blocked.status, 3);
    assert.match(blocked.stderr, /cooldown/);
    assert.ok(propose(env, body, '2026-11-11T22:00:00+09:00').proposed);
  } finally { env.cleanup(); }
});

test('new_skill: secrets rejected not masked; CRLF and quoted name accepted; replace.new with secret rejected', () => {
  const env = setup();
  try {
    const base = { kind: 'repeat_task', reason: 'r', agent: 'main', skillName: 'weekly-sales', summary: 's' };
    assert.notEqual(tryPropose(env, { ...base, type: 'new_skill', key: 'k-a', skillMd: `${SKILL_MD}키는 sk-abcdefghijklmnop1234\n` }).status, 0);
    const crlf = SKILL_MD.replace('name: weekly-sales', 'name: "weekly-sales"').replace(/\n/g, '\r\n');
    const ok = propose(env, { ...base, type: 'new_skill', key: 'k-b', skillMd: crlf });
    const stored = JSON.parse(fs.readFileSync(path.join(env.main, 'learnings', 'pending', `${ok.id}.json`), 'utf8'));
    assert.equal(stored.skillMd.includes('\r'), false);
    assert.equal(stored.skillMd.includes('name: "weekly-sales"'), true);
    fs.writeFileSync(path.join(env.main, 'AGENTS.md'), '옛 문장\n');
    assert.notEqual(tryPropose(env, { kind: 'correction', reason: 'r', type: 'replace', agent: 'main', key: 'k-c', file: 'AGENTS.md', old: '옛 문장', new: '연락처 hong@example.com' }).status, 0);
  } finally { env.cleanup(); }
});

test('a broken ledger line stops propose with Korean recovery guidance', () => {
  const env = setup();
  try {
    propose(env, { type: 'append', agent: 'main', key: 'l-1', kind: 'correction', reason: 'r', file: 'AGENTS.md', line: 'a' });
    fs.appendFileSync(path.join(env.main, 'learnings', 'ledger.jsonl'), 'not json\n');
    const r = tryPropose(env, { type: 'append', agent: 'main', key: 'l-2', kind: 'correction', reason: 'r', file: 'AGENTS.md', line: 'b' });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /장부\(ledger\.jsonl\) 2번째 줄이 망가졌어요\. 그 줄을 지우면 다시 돌아가요/);
  } finally { env.cleanup(); }
});

test('replace that would erase or add a section marker is refused; editing inside the section is fine', () => {
  const env = setup();
  try {
    fs.writeFileSync(path.join(env.main, 'AGENTS.md'), '# 규칙\n<!-- self-improve:start -->\n## 성장 노트 — 배운 규칙\n- 옛 규칙\n<!-- self-improve:end -->\n');
    fs.writeFileSync(path.join(env.main, 'SOUL.md'), '앞\n<!-- self-improve-hook:start -->\n행동\n<!-- self-improve-hook:end -->\n');
    const base = { type: 'replace', kind: 'correction', reason: 'r', agent: 'main' };
    const erase = tryPropose(env, { ...base, key: 'k-a', file: 'AGENTS.md', old: '- 옛 규칙\n<!-- self-improve:end -->', new: '- 새 규칙' });
    assert.notEqual(erase.status, 0);
    assert.match(erase.stderr, /성장 노트 구역 표시가 지워지는 수정은 할 수 없어요/);
    const hook = tryPropose(env, { ...base, key: 'k-b', file: 'SOUL.md', old: '<!-- self-improve-hook:start -->\n행동', new: '행동' });
    assert.match(hook.stderr, /구역 표시가 지워지는/);
    const added = tryPropose(env, { ...base, key: 'k-c', file: 'AGENTS.md', old: '# 규칙', new: '# 규칙\n<!-- self-improve:start -->' });
    assert.notEqual(added.status, 0);
    assert.ok(propose(env, { ...base, key: 'k-d', file: 'AGENTS.md', old: '- 옛 규칙', new: '- 새 규칙' }).proposed);
  } finally { env.cleanup(); }
});

test('propose refuses to touch the self-improve skill: replace of its files and a new_skill named self-improve', () => {
  const env = setup();
  try {
    fs.mkdirSync(path.join(env.main, 'skills', 'self-improve'), { recursive: true });
    fs.writeFileSync(path.join(env.main, 'skills', 'self-improve', 'SKILL.md'), '# 성장 노트\n규칙\n');
    const replace = tryPropose(env, { type: 'replace', agent: 'main', key: 'k-a', kind: 'correction', reason: 'r', file: 'skills/self-improve/SKILL.md', old: '규칙', new: '다른 규칙' });
    assert.notEqual(replace.status, 0);
    assert.match(replace.stderr, /성장 노트 스킬 자신은 고칠 수 없어요/);
    const draft = SKILL_MD.replaceAll('weekly-sales', 'self-improve');
    const created = tryPropose(env, { type: 'new_skill', agent: 'researcher', key: 'k-b', kind: 'repeat_task', reason: 'r', skillName: 'self-improve', summary: 's', skillMd: draft });
    assert.notEqual(created.status, 0);
    assert.match(created.stderr, /성장 노트 스킬 자신은 고칠 수 없어요/);
  } finally { env.cleanup(); }
});
