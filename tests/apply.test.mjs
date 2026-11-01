import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { message, note, propose, run, runJson, setup } from './helpers.mjs';

const APPLY_AT = '2026-11-02T22:10:00+09:00';
const apply = (env, args) => run('apply.mjs', ['--workspace', env.main, '--now', APPLY_AT, ...args]);

test('append creates the section with date, keeps student text, backs up, ledgers', () => {
  const env = setup();
  try {
    const agents = path.join(env.main, 'AGENTS.md');
    fs.writeFileSync(agents, '# 내 규칙\n수강생 문장\n');
    propose(env, { type: 'append', agent: 'main', key: 'report-3line', kind: 'correction', reason: 'r', file: 'AGENTS.md', line: '보고는 3줄 요약부터 시작한다' });
    message(env);
    const r = apply(env, ['--number', '1']);
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.match(out.message, /^반영했어요 — 업무 규칙 · 총괄\. 되돌리려면 "1 되돌려"$/);
    assert.equal(fs.readFileSync(agents, 'utf8'), '# 내 규칙\n수강생 문장\n\n<!-- self-improve:start -->\n## 성장 노트 — 배운 규칙\n- 보고는 3줄 요약부터 시작한다 (2026-11-02 승인)\n<!-- self-improve:end -->\n');
    const backup = fs.readdirSync(path.join(env.main, 'learnings', 'backups'))[0];
    assert.equal(fs.readFileSync(path.join(env.main, 'learnings', 'backups', backup, 'original'), 'utf8'), '# 내 규칙\n수강생 문장\n');
    const ledger = fs.readFileSync(path.join(env.main, 'learnings', 'ledger.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(ledger.at(-1).action, 'applied');
    assert.notEqual(apply(env, ['--number', '1']).status, 0, 'second apply refused');
  } finally { env.cleanup(); }
});

test('user_trait append marks (추정) in USER.md', () => {
  const env = setup();
  try {
    propose(env, { type: 'append', agent: 'main', key: 'numbers-first', kind: 'user_trait', reason: 'r', file: 'USER.md', line: '숫자 근거부터 확인하신다' });
    message(env);
    assert.equal(apply(env, ['--number', '1']).status, 0);
    assert.match(fs.readFileSync(path.join(env.main, 'USER.md'), 'utf8'), /## 성장 노트 — 대표님에 대해 \(추정 포함\)\n- \(추정\) 숫자 근거부터 확인하신다 \(2026-11-02 승인\)/);
  } finally { env.cleanup(); }
});

test('replace edits only the matched sentence in a teammate skill; stale sha is refused', () => {
  const env = setup();
  try {
    const skill = path.join(env.researcher, 'skills', 'news-brief', 'SKILL.md');
    fs.mkdirSync(path.dirname(skill), { recursive: true });
    fs.writeFileSync(skill, '# 뉴스\n기사 5건을 요약한다 ($& 기호 포함)\n끝\n');
    propose(env, { type: 'replace', agent: 'researcher', key: 'news-3', kind: 'correction', reason: 'r', file: 'skills/news-brief/SKILL.md', old: '기사 5건을 요약한다 ($& 기호 포함)', new: '기사 3건 ($1 그대로)' }, '2026-11-02T21:00:00+09:00');
    fs.writeFileSync(path.join(env.main, 'TOOLS.md'), 'v1\n');
    propose(env, { type: 'replace', agent: 'main', key: 'tools-x', kind: 'correction', reason: 'r', file: 'TOOLS.md', old: 'v1', new: 'v1 고침' }, '2026-11-02T21:01:00+09:00');
    message(env);
    assert.equal(apply(env, ['--number', '1']).status, 0);
    assert.equal(fs.readFileSync(skill, 'utf8'), '# 뉴스\n기사 3건 ($1 그대로)\n끝\n');
    fs.writeFileSync(path.join(env.main, 'TOOLS.md'), 'v2 student edit\n');
    const stale = apply(env, ['--number', '2']);
    assert.equal(stale.status, 4);
    assert.match(stale.stderr, /낡았어요/);
    assert.equal(fs.readFileSync(path.join(env.main, 'TOOLS.md'), 'utf8'), 'v2 student edit\n');
  } finally { env.cleanup(); }
});

test('new_skill writes SKILL.md into the agent skills folder; --all applies every numbered item and reports each', () => {
  const env = setup();
  try {
    const md = '---\nname: weekly-sales\ndescription: "(시험판) 주간 매출"\n---\n\n# 주간 매출 정리\n';
    propose(env, { type: 'new_skill', agent: 'researcher', key: 'weekly-sales', kind: 'repeat_task', reason: 'r', skillName: 'weekly-sales', summary: 's', skillMd: md }, '2026-11-02T21:00:00+09:00');
    fs.writeFileSync(path.join(env.main, 'SOUL.md'), 'a\n');
    propose(env, { type: 'replace', agent: 'main', key: 'soul-x', kind: 'correction', reason: 'r', file: 'SOUL.md', old: 'a', new: '존댓말' }, '2026-11-02T21:01:00+09:00');
    message(env);
    fs.writeFileSync(path.join(env.main, 'SOUL.md'), 'changed\n');
    const r = apply(env, ['--all']);
    assert.equal(r.status, 1);
    const out = JSON.parse(r.stdout);
    assert.deepEqual(out.results.map(x => [x.number, x.ok]), [['1', true], ['2', false]]);
    assert.equal(fs.readFileSync(path.join(env.researcher, 'skills', 'weekly-sales', 'SKILL.md'), 'utf8'), md);
  } finally { env.cleanup(); }
});

const SKILL_DRAFT = '---\nname: weekly-sales\ndescription: "(시험판) 주간 매출"\n---\n\n# 주간 매출 정리\n';

test('new_skill refuses when skills/ is a symlink or the skill folder is a broken symlink; nothing is written', () => {
  const env = setup();
  try {
    const outside = path.join(env.root, 'outside');
    fs.mkdirSync(outside);
    propose(env, { type: 'new_skill', agent: 'main', key: 'weekly-sales', kind: 'repeat_task', reason: 'r', skillName: 'weekly-sales', summary: 's', skillMd: SKILL_DRAFT });
    message(env);
    fs.symlinkSync(outside, path.join(env.main, 'skills'));
    const viaDir = apply(env, ['--number', '1']);
    assert.notEqual(viaDir.status, 0);
    assert.match(viaDir.stderr, /바로가기|가리켜요/);
    assert.deepEqual(fs.readdirSync(outside), []);
    fs.unlinkSync(path.join(env.main, 'skills'));

    fs.mkdirSync(path.join(env.main, 'skills'));
    fs.symlinkSync(path.join(env.root, 'does-not-exist'), path.join(env.main, 'skills', 'weekly-sales'));
    const broken = apply(env, ['--number', '1']);
    assert.notEqual(broken.status, 0);
    assert.match(broken.stderr, /이미 있어요/);
    assert.equal(fs.existsSync(path.join(env.root, 'does-not-exist')), false);
    const status = JSON.parse(fs.readFileSync(path.join(env.main, 'learnings', 'pending', fs.readdirSync(path.join(env.main, 'learnings', 'pending'))[0]), 'utf8')).status;
    assert.equal(status, 'pending');
  } finally { env.cleanup(); }
});

test('a broken ledger line stops apply with recovery guidance and changes nothing', () => {
  const env = setup();
  try {
    propose(env, { type: 'append', agent: 'main', key: 'a-1', kind: 'correction', reason: 'r', file: 'AGENTS.md', line: 'x' });
    message(env);
    fs.appendFileSync(path.join(env.main, 'learnings', 'ledger.jsonl'), '{깨진 줄\n');
    const r = apply(env, ['--number', '1']);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /장부\(ledger\.jsonl\) 2번째 줄이 망가졌어요\. 그 줄을 지우면 다시 돌아가요/);
    assert.equal(fs.existsSync(path.join(env.main, 'AGENTS.md')), false);
  } finally { env.cleanup(); }
});

const ledgerOf = env => fs.readFileSync(path.join(env.main, 'learnings', 'ledger.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const pendingOf = (env, id) => JSON.parse(fs.readFileSync(path.join(env.main, 'learnings', 'pending', `${id}.json`), 'utf8'));

test('a stale replace is closed as stale (exit 4), ledgered, and its key is free for a new proposal', () => {
  const env = setup();
  try {
    fs.writeFileSync(path.join(env.main, 'TOOLS.md'), 'v1\n');
    const first = propose(env, { type: 'replace', agent: 'main', key: 'tools-x', kind: 'correction', reason: 'r', file: 'TOOLS.md', old: 'v1', new: 'v1 고침' });
    message(env);
    fs.writeFileSync(path.join(env.main, 'TOOLS.md'), 'v2 student edit\n');
    const r = apply(env, ['--number', '1']);
    assert.equal(r.status, 4);
    assert.equal(pendingOf(env, first.id).status, 'stale');
    assert.equal(ledgerOf(env).at(-1).action, 'stale');
    const again = propose(env, { type: 'replace', agent: 'main', key: 'tools-x', kind: 'correction', reason: 'r', file: 'TOOLS.md', old: 'v2 student edit', new: 'v2 고침' }, '2026-11-03T22:00:00+09:00');
    assert.ok(again.proposed);
  } finally { env.cleanup(); }
});

test('replace whose sentence is no longer found exactly once is also closed as stale (exit 4)', () => {
  const env = setup();
  try {
    fs.writeFileSync(path.join(env.main, 'TOOLS.md'), '문장 하나\n');
    const first = propose(env, { type: 'replace', agent: 'main', key: 'tools-y', kind: 'correction', reason: 'r', file: 'TOOLS.md', old: '문장 하나', new: '문장 둘' });
    message(env);
    // 내용은 같게 두고 sha 만 같은 파일에서 문장이 사라지는 경우는 sha 검사에 먼저 걸리므로, 제안 파일을 직접 고쳐 sha 를 맞춘다.
    const file = path.join(env.main, 'TOOLS.md');
    fs.writeFileSync(file, '문장 하나\n문장 하나\n');
    const stored = pendingOf(env, first.id);
    stored.baseSha = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    fs.writeFileSync(path.join(env.main, 'learnings', 'pending', `${first.id}.json`), JSON.stringify(stored));
    const r = apply(env, ['--number', '1']);
    assert.equal(r.status, 4);
    assert.match(r.stderr, /낡았어요/);
    assert.equal(pendingOf(env, first.id).status, 'stale');
  } finally { env.cleanup(); }
});

test('append is safe against unrelated edits: re-applied to the current file; two appends to one file with --all both apply', () => {
  const env = setup();
  try {
    const agents = path.join(env.main, 'AGENTS.md');
    fs.writeFileSync(agents, '# 규칙\n');
    propose(env, { type: 'append', agent: 'main', key: 'rule-a', kind: 'correction', reason: 'r', file: 'AGENTS.md', line: '첫째 규칙' }, '2026-11-02T21:00:00+09:00');
    propose(env, { type: 'append', agent: 'main', key: 'rule-b', kind: 'correction', reason: 'r', file: 'AGENTS.md', line: '둘째 규칙' }, '2026-11-02T21:01:00+09:00');
    message(env);
    const r = apply(env, ['--all']);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout).results.map(x => x.ok), [true, true]);
    const text = fs.readFileSync(agents, 'utf8');
    assert.match(text, /- 첫째 규칙 \(2026-11-02 승인\)\n- 둘째 규칙 \(2026-11-02 승인\)\n<!-- self-improve:end -->/);

    propose(env, { type: 'append', agent: 'main', key: 'rule-c', kind: 'correction', reason: 'r', file: 'AGENTS.md', line: '셋째 규칙' }, '2026-11-03T21:00:00+09:00');
    message(env, '2026-11-03T22:00:00+09:00');
    fs.writeFileSync(agents, `학생이 맨 위에 쓴 줄\n${text}`);
    assert.equal(apply(env, ['--number', '1']).status, 0);
    const after = fs.readFileSync(agents, 'utf8');
    assert.match(after, /^학생이 맨 위에 쓴 줄\n# 규칙/);
    assert.match(after, /- 셋째 규칙/);
  } finally { env.cleanup(); }
});

test('append is refused and closed as stale when the section now has a missing end marker', () => {
  const env = setup();
  try {
    const first = propose(env, { type: 'append', agent: 'main', key: 'rule-a', kind: 'correction', reason: 'r', file: 'AGENTS.md', line: '규칙' });
    message(env);
    fs.writeFileSync(path.join(env.main, 'AGENTS.md'), '<!-- self-improve:start -->\n- 옛 규칙\n');
    const r = apply(env, ['--number', '1']);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /끝 표시/);
    assert.equal(fs.readFileSync(path.join(env.main, 'AGENTS.md'), 'utf8'), '<!-- self-improve:start -->\n- 옛 규칙\n');
    assert.equal(pendingOf(env, first.id).status, 'stale');
  } finally { env.cleanup(); }
});

test('crash between ledger and proposal save: re-running only fixes the status, no second write', () => {
  const env = setup();
  try {
    const agents = path.join(env.main, 'AGENTS.md');
    const first = propose(env, { type: 'append', agent: 'main', key: 'rule-a', kind: 'correction', reason: 'r', file: 'AGENTS.md', line: '규칙' });
    message(env);
    assert.equal(apply(env, ['--number', '1']).status, 0);
    const written = fs.readFileSync(agents, 'utf8');
    const stored = pendingOf(env, first.id);
    stored.status = 'pending'; delete stored.appliedAt;
    fs.writeFileSync(path.join(env.main, 'learnings', 'pending', `${first.id}.json`), JSON.stringify(stored));
    const r = apply(env, ['--number', '1']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(JSON.parse(r.stdout).message, /^반영했어요/);
    assert.equal(fs.readFileSync(agents, 'utf8'), written);
    assert.equal(pendingOf(env, first.id).status, 'applied');
    assert.equal(ledgerOf(env).filter(e => e.action === 'applied').length, 1);
  } finally { env.cleanup(); }
});

test('replace that would erase a section marker is refused at apply time too', () => {
  const env = setup();
  try {
    const agents = path.join(env.main, 'AGENTS.md');
    fs.writeFileSync(agents, '<!-- self-improve:start -->\n- 옛 규칙\n<!-- self-improve:end -->\n');
    const first = propose(env, { type: 'replace', agent: 'main', key: 'rule-a', kind: 'correction', reason: 'r', file: 'AGENTS.md', old: '- 옛 규칙', new: '- 새 규칙' });
    message(env);
    const stored = pendingOf(env, first.id);
    stored.old = '- 옛 규칙\n<!-- self-improve:end -->'; stored.new = '- 새 규칙';
    fs.writeFileSync(path.join(env.main, 'learnings', 'pending', `${first.id}.json`), JSON.stringify(stored));
    const r = apply(env, ['--number', '1']);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /구역 표시가 지워지는 수정은 할 수 없어요/);
    assert.equal(fs.readFileSync(agents, 'utf8'), '<!-- self-improve:start -->\n- 옛 규칙\n<!-- self-improve:end -->\n');
  } finally { env.cleanup(); }
});

test('new_skill ledger entry records skillSha and the file list', () => {
  const env = setup();
  try {
    propose(env, { type: 'new_skill', agent: 'main', key: 'weekly-sales', kind: 'repeat_task', reason: 'r', skillName: 'weekly-sales', summary: 's', skillMd: SKILL_DRAFT });
    message(env);
    assert.equal(apply(env, ['--number', '1']).status, 0);
    const entry = ledgerOf(env).at(-1);
    assert.equal(entry.skillSha, createHash('sha256').update(SKILL_DRAFT).digest('hex'));
    assert.deepEqual(entry.files, ['SKILL.md']);
  } finally { env.cleanup(); }
});

// 쓰기는 끝났는데 장부에 적기 전에 멈춘 상황을 흉내 낸다: 'applied' 장부 줄을 지우고 제안을 다시 pending 으로 돌린다.
function simulateCrashAfterWrite(env, id) {
  const ledgerFile = path.join(env.main, 'learnings', 'ledger.jsonl');
  const kept = fs.readFileSync(ledgerFile, 'utf8').trim().split('\n').filter(line => JSON.parse(line).action !== 'applied');
  fs.writeFileSync(ledgerFile, kept.map(l => `${l}\n`).join(''));
  const stored = pendingOf(env, id);
  stored.status = 'pending'; delete stored.appliedAt;
  fs.writeFileSync(path.join(env.main, 'learnings', 'pending', `${id}.json`), JSON.stringify(stored));
}
const rollbackN = (env, n) => run('rollback.mjs', ['--workspace', env.main, '--number', n, '--now', '2026-11-03T09:00:00+09:00']);
const countOf = (text, needle) => text.split(needle).length - 1;

test('crash after file write (append): re-apply writes nothing again, keeps the real original backup, rollback truly restores', () => {
  const env = setup();
  try {
    const agents = path.join(env.main, 'AGENTS.md');
    fs.writeFileSync(agents, '진짜 원본\n');
    const first = propose(env, { type: 'append', agent: 'main', key: 'rule-a', kind: 'correction', reason: 'r', file: 'AGENTS.md', line: '한 번만 들어갈 규칙' });
    message(env);
    assert.equal(apply(env, ['--number', '1']).status, 0);
    const written = fs.readFileSync(agents, 'utf8');
    const original = path.join(env.main, 'learnings', 'backups', first.id, 'original');
    simulateCrashAfterWrite(env, first.id);
    const r = apply(env, ['--number', '1']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(JSON.parse(r.stdout).message, /^반영했어요/);
    assert.equal(fs.readFileSync(agents, 'utf8'), written);
    assert.equal(countOf(fs.readFileSync(agents, 'utf8'), '한 번만 들어갈 규칙'), 1);
    assert.equal(fs.readFileSync(original, 'utf8'), '진짜 원본\n');
    assert.equal(pendingOf(env, first.id).status, 'applied');
    assert.equal(ledgerOf(env).filter(e => e.action === 'applied').length, 1);
    const back = rollbackN(env, '1');
    assert.equal(back.status, 0, back.stderr);
    assert.equal(fs.readFileSync(agents, 'utf8'), '진짜 원본\n');
  } finally { env.cleanup(); }
});

test('crash after file write (append creating the file): recovery records no original, rollback archives the file', () => {
  const env = setup();
  try {
    const first = propose(env, { type: 'append', agent: 'main', key: 'rule-a', kind: 'correction', reason: 'r', file: 'TOOLS.md', line: '새 파일 규칙' });
    message(env);
    assert.equal(apply(env, ['--number', '1']).status, 0);
    simulateCrashAfterWrite(env, first.id);
    assert.equal(apply(env, ['--number', '1']).status, 0);
    const entry = ledgerOf(env).at(-1);
    assert.equal(entry.action, 'applied');
    assert.equal(entry.backup, null);
    assert.equal(rollbackN(env, '1').status, 0);
    assert.equal(fs.existsSync(path.join(env.main, 'TOOLS.md')), false);
  } finally { env.cleanup(); }
});

test('crash after file write (replace): ends applied, not stale; rollback restores the real original', () => {
  const env = setup();
  try {
    const tools = path.join(env.main, 'TOOLS.md');
    fs.writeFileSync(tools, '앞\n옛 문장\n뒤\n');
    const first = propose(env, { type: 'replace', agent: 'main', key: 'tools-r', kind: 'correction', reason: 'r', file: 'TOOLS.md', old: '옛 문장', new: '새 문장' });
    message(env);
    assert.equal(apply(env, ['--number', '1']).status, 0);
    simulateCrashAfterWrite(env, first.id);
    const r = apply(env, ['--number', '1']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(pendingOf(env, first.id).status, 'applied');
    assert.equal(fs.readFileSync(tools, 'utf8'), '앞\n새 문장\n뒤\n');
    assert.equal(fs.readFileSync(path.join(env.main, 'learnings', 'backups', first.id, 'original'), 'utf8'), '앞\n옛 문장\n뒤\n');
    assert.equal(ledgerOf(env).some(e => e.action === 'stale'), false);
    assert.equal(rollbackN(env, '1').status, 0);
    assert.equal(fs.readFileSync(tools, 'utf8'), '앞\n옛 문장\n뒤\n');
  } finally { env.cleanup(); }
});

test('crash after file write (new_skill): same SKILL.md => ledger is filled, no "already exists", rollback archives the folder', () => {
  const env = setup();
  try {
    const first = propose(env, { type: 'new_skill', agent: 'main', key: 'weekly-sales', kind: 'repeat_task', reason: 'r', skillName: 'weekly-sales', summary: 's', skillMd: SKILL_DRAFT });
    message(env);
    assert.equal(apply(env, ['--number', '1']).status, 0);
    simulateCrashAfterWrite(env, first.id);
    const r = apply(env, ['--number', '1']);
    assert.equal(r.status, 0, r.stderr);
    const entry = ledgerOf(env).at(-1);
    assert.equal(entry.action, 'applied');
    assert.equal(entry.skillSha, createHash('sha256').update(SKILL_DRAFT).digest('hex'));
    assert.deepEqual(entry.files, ['SKILL.md']);
    assert.equal(pendingOf(env, first.id).status, 'applied');
    assert.equal(rollbackN(env, '1').status, 0);
    assert.equal(fs.existsSync(path.join(env.main, 'skills', 'weekly-sales')), false);
  } finally { env.cleanup(); }
});

test('an existing skill with different content is still refused (not mistaken for a crash recovery)', () => {
  const env = setup();
  try {
    propose(env, { type: 'new_skill', agent: 'main', key: 'weekly-sales', kind: 'repeat_task', reason: 'r', skillName: 'weekly-sales', summary: 's', skillMd: SKILL_DRAFT });
    message(env);
    fs.mkdirSync(path.join(env.main, 'skills', 'weekly-sales'), { recursive: true });
    fs.writeFileSync(path.join(env.main, 'skills', 'weekly-sales', 'SKILL.md'), '다른 내용\n');
    const r = apply(env, ['--number', '1']);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /이미 있어요/);
    assert.equal(fs.readFileSync(path.join(env.main, 'skills', 'weekly-sales', 'SKILL.md'), 'utf8'), '다른 내용\n');
  } finally { env.cleanup(); }
});

const stateOf = env => JSON.parse(fs.readFileSync(path.join(env.main, 'learnings', 'state.json'), 'utf8'));
const collectAt = (env, now) => runJson('collect.mjs', ['--workspace', env.main, '--team', env.team, '--now', now]);

test('stale (exit 4) releases the proposal\'s notes so collect lists the group as eligible again next evening', () => {
  const env = setup();
  try {
    fs.writeFileSync(path.join(env.main, 'TOOLS.md'), 'v1\n');
    const n = note(env.main, 'main', 'correction', 'tools-x', 'v1 을 고쳐 주세요', 'TOOLS.md');
    propose(env, { type: 'replace', agent: 'main', key: 'tools-x', kind: 'correction', reason: 'r', file: 'TOOLS.md', old: 'v1', new: 'v1 고침', noteIds: [n.id] });
    assert.deepEqual(stateOf(env).processed, [n.id]);
    assert.deepEqual(collectAt(env, '2026-11-03T22:00:00+09:00').groups, []);
    message(env);
    fs.writeFileSync(path.join(env.main, 'TOOLS.md'), 'v2 student edit\n');
    assert.equal(apply(env, ['--number', '1']).status, 4);
    assert.deepEqual(stateOf(env).processed, []);
    const group = collectAt(env, '2026-11-03T22:00:00+09:00').groups[0];
    assert.equal(group.key, 'tools-x');
    assert.equal(group.eligible, true);
  } finally { env.cleanup(); }
});

test('stale from an append hitting a broken section also releases the notes', () => {
  const env = setup();
  try {
    const n = note(env.main, 'main', 'correction', 'rule-a', '규칙', 'AGENTS.md');
    propose(env, { type: 'append', agent: 'main', key: 'rule-a', kind: 'correction', reason: 'r', file: 'AGENTS.md', line: '규칙', noteIds: [n.id] });
    message(env);
    fs.writeFileSync(path.join(env.main, 'AGENTS.md'), '<!-- self-improve:start -->\n- 옛 규칙\n');
    assert.notEqual(apply(env, ['--number', '1']).status, 0);
    assert.deepEqual(stateOf(env).processed, []);
    assert.equal(collectAt(env, '2026-11-03T22:00:00+09:00').groups[0].eligible, true);
  } finally { env.cleanup(); }
});
