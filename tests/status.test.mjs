import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { message, note, propose, run, runJson, runOk, setup } from './helpers.mjs';

const SUNDAY = '2026-11-08T22:00:00+09:00';

test('weekly report summarizes last 7 days across team in plain Korean', () => {
  const env = setup();
  try {
    note(env.main, 'main', 'correction', 'k1', 'a', 'AGENTS.md', '2026-11-03T10:00:00+09:00');
    note(env.researcher, 'researcher', 'failure', 'k2', 'b', 'TOOLS.md', '2026-11-04T10:00:00+09:00');
    note(env.researcher, 'researcher', 'wish', 'k3', '카톡 단톡방 요약', 'new-skill', '2026-11-05T10:00:00+09:00');
    note(env.main, 'main', 'correction', 'k-old', 'old', 'AGENTS.md', '2026-10-20T10:00:00+09:00');
    propose(env, { type: 'append', agent: 'main', key: 'k1', kind: 'correction', reason: 'r', file: 'AGENTS.md', line: 'a' }, '2026-11-03T22:00:00+09:00');
    message(env, '2026-11-03T22:00:00+09:00');
    runOk('apply.mjs', ['--workspace', env.main, '--number', '1', '--now', '2026-11-03T22:05:00+09:00']);
    const text = runOk('status.mjs', ['--workspace', env.main, '--team', env.team, '--weekly', '--now', SUNDAY]);
    assert.equal(text, [
      '🌱 성장 노트 — 이번 주 성장 리포트 (11/2~11/8)',
      '',
      '배운 점 3개 — 교정 1 · 실패 1 · 바라는 기능 1',
      '반영된 개선 1건 · 거절 0건 · 대기 0건',
      '',
      "팀원별: 총괄 1 · 'researcher' 2",
      '',
      '바라는 기능',
      '- 카톡 단톡방 요약',
      '',
    ].join('\n'));
  } finally { env.cleanup(); }
});

test('weekly report with nothing recorded is encouraging, --json has widget shape', () => {
  const env = setup();
  try {
    assert.match(runOk('status.mjs', ['--workspace', env.main, '--team', env.team, '--weekly', '--now', SUNDAY]), /이번 주는 기록된 배운 점이 없어요/);
    const j = runJson('status.mjs', ['--workspace', env.main, '--team', env.team, '--json', '--now', SUNDAY]);
    assert.deepEqual(Object.keys(j).sort(), ['applied', 'newSkills', 'notesThisWeek', 'notesTotal', 'pending', 'rejected', 'week']);
    assert.equal(j.notesTotal, 0);
    assert.match(runOk('status.mjs', ['--workspace', env.main, '--team', env.team, '--now', SUNDAY]), /^🌱 성장 노트 현황/);
  } finally { env.cleanup(); }
});

test('weekly report skips broken/odd note lines but stops on a broken ledger with Korean guidance', () => {
  const env = setup();
  try {
    note(env.main, 'main', 'correction', 'k1', 'a', 'AGENTS.md', '2026-11-03T10:00:00+09:00');
    fs.appendFileSync(path.join(env.main, 'learnings', 'notes.jsonl'), '{깨진 줄\n42\nnull\n');
    const args = ['--workspace', env.main, '--team', env.team, '--weekly', '--now', SUNDAY];
    assert.match(runOk('status.mjs', args), /배운 점 1개 — 교정 1/);
    fs.writeFileSync(path.join(env.main, 'learnings', 'ledger.jsonl'), '{깨짐\n');
    const r = run('status.mjs', args);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /장부\(ledger\.jsonl\) 1번째 줄이 망가졌어요\. 그 줄을 지우면 다시 돌아가요/);
  } finally { env.cleanup(); }
});

const weekly = (env, now = SUNDAY) => runOk('status.mjs', ['--workspace', env.main, '--team', env.team, '--weekly', '--now', now]);

test('week window = KST 00:00 six days ago .. now; unparsable timestamps are skipped', () => {
  const env = setup();
  try {
    note(env.main, 'main', 'correction', 'k-in', 'a', 'AGENTS.md', '2026-11-02T00:30:00+09:00');
    note(env.main, 'main', 'correction', 'k-out', 'b', 'AGENTS.md', '2026-11-01T23:30:00+09:00');
    note(env.main, 'main', 'failure', 'k-future', 'c', 'TOOLS.md', '2026-11-09T09:00:00+09:00');
    fs.appendFileSync(path.join(env.main, 'learnings', 'notes.jsonl'), `${JSON.stringify({ id: 'n-x', ts: '언제였더라', agent: 'main', kind: 'failure', key: 'k-bad-ts', lesson: 'l' })}\n`);
    const text = weekly(env);
    assert.match(text, /\(11\/2~11\/8\)/);
    assert.match(text, /배운 점 1개 — 교정 1\n/);
    assert.equal(runJson('status.mjs', ['--workspace', env.main, '--team', env.team, '--json', '--now', SUNDAY]).notesTotal, 4);
  } finally { env.cleanup(); }
});

test('expired and rolled-back are reported only when > 0; rolled-back applies are not counted; new skill is named', () => {
  const env = setup();
  try {
    const md = '---\nname: weekly-sales\ndescription: "(시험판) 주간 매출"\n---\n\n본문\n';
    propose(env, { type: 'new_skill', agent: 'main', key: 'weekly-sales', kind: 'repeat_task', reason: 'r', skillName: 'weekly-sales', summary: 's', skillMd: md }, '2026-11-03T21:00:00+09:00');
    message(env, '2026-11-03T22:00:00+09:00');
    runOk('apply.mjs', ['--workspace', env.main, '--number', '1', '--now', '2026-11-03T22:05:00+09:00']);
    let text = weekly(env);
    assert.match(text, /^반영된 개선 1건 · 거절 0건 · 대기 0건$/m);
    assert.match(text, /^새 스킬: weekly-sales\(시험판\)$/m);
    assert.equal(text.includes('만료'), false);
    assert.equal(text.includes('되돌림'), false);

    runOk('rollback.mjs', ['--workspace', env.main, '--number', '1', '--now', '2026-11-04T09:00:00+09:00']);
    propose(env, { type: 'append', agent: 'main', key: 'old-1', kind: 'correction', reason: 'r', file: 'AGENTS.md', line: 'a' }, '2026-10-31T22:00:00+09:00');
    runOk('maintain.mjs', ['--workspace', env.main, '--team', env.team, '--now', '2026-11-08T21:00:00+09:00']);
    text = weekly(env);
    assert.match(text, /^반영된 개선 0건 · 거절 0건 · 대기 0건 · 만료 1건 · 되돌림 1건$/m);
    assert.equal(text.includes('새 스킬'), false);
  } finally { env.cleanup(); }
});

test('lines that would be empty are hidden (no "배운 점 0개", no empty "팀원별")', () => {
  const env = setup();
  try {
    note(env.main, 'main', 'correction', 'k-old', 'a', 'AGENTS.md', '2026-10-01T10:00:00+09:00');
    propose(env, { type: 'append', agent: 'main', key: 'k-old', kind: 'correction', reason: 'r', file: 'AGENTS.md', line: 'a' }, '2026-11-03T21:00:00+09:00');
    message(env, '2026-11-03T22:00:00+09:00');
    runOk('apply.mjs', ['--workspace', env.main, '--number', '1', '--now', '2026-11-03T22:05:00+09:00']);
    assert.equal(weekly(env), '🌱 성장 노트 — 이번 주 성장 리포트 (11/2~11/8)\n\n반영된 개선 1건 · 거절 0건 · 대기 0건\n');
  } finally { env.cleanup(); }
});
