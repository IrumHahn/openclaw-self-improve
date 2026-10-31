import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { resolveTarget } from '../skill/self-improve/scripts/lib/guard.mjs';
import { appendRule, markersIntact, MAX_LINES, sectionRules } from '../skill/self-improve/scripts/lib/section.mjs';
import { setup } from './helpers.mjs';

test('resolveTarget allows rule files and skill files only, blocks escapes and symlinks out', () => {
  const env = setup();
  try {
    for (const ok of ['AGENTS.md', 'TOOLS.md', 'SOUL.md', 'USER.md', 'skills/news-brief/SKILL.md', 'skills/news-brief/references/format.md'])
      assert.equal(resolveTarget(env.main, ok), path.join(env.main, ok));
    for (const bad of ['openclaw.json', '.env', 'STATE.md', 'logs/a.md', 'learnings/state.json', '../researcher/AGENTS.md', '/etc/passwd', 'skills/../AGENTS.md', 'skills/x/scripts/run.mjs', 'skills/Bad/SKILL.md'])
      assert.throws(() => resolveTarget(env.main, bad), /허용|고칠 수 없는|밖/, bad);
    fs.symlinkSync(env.researcher, path.join(env.main, 'skills'));
    assert.throws(() => resolveTarget(env.main, 'skills/news-brief/SKILL.md'), /밖/);
  } finally { env.cleanup(); }
});

test('appendRule creates the marked section once, appends inside it, enforces 30 lines', () => {
  let text = '# 내 규칙\n수강생이 쓴 문장\n';
  text = appendRule(text, 'AGENTS.md', '보고는 3줄 요약부터');
  assert.equal(text, '# 내 규칙\n수강생이 쓴 문장\n\n<!-- self-improve:start -->\n## 성장 노트 — 배운 규칙\n- 보고는 3줄 요약부터\n<!-- self-improve:end -->\n');
  text = appendRule(text, 'AGENTS.md', '숫자는 표로');
  assert.deepEqual(sectionRules(text), ['- 보고는 3줄 요약부터', '- 숫자는 표로']);
  assert.match(appendRule('', 'USER.md', '(추정) 숫자부터'), /## 성장 노트 — 주인에 대해 \(추정 포함\)/);
  let full = '';
  for (let i = 0; i < MAX_LINES; i++) full = appendRule(full, 'AGENTS.md', `규칙 ${i}`);
  assert.throws(() => appendRule(full, 'AGENTS.md', '하나 더'), /가득/);
  assert.throws(() => appendRule('<!-- self-improve:start -->\n- a\n', 'AGENTS.md', 'b'), /끝 표시/);
});

test('resolveTarget rejects symlinks that stay inside the workspace (and broken ones)', () => {
  const env = setup();
  try {
    fs.writeFileSync(path.join(env.main, 'openclaw.json'), '{}');
    fs.symlinkSync(path.join(env.main, 'openclaw.json'), path.join(env.main, 'AGENTS.md'));
    assert.throws(() => resolveTarget(env.main, 'AGENTS.md'), /바로가기/);
    fs.mkdirSync(path.join(env.main, 'learnings'));
    fs.symlinkSync(path.join(env.main, 'learnings'), path.join(env.main, 'skills'));
    assert.throws(() => resolveTarget(env.main, 'skills/foo/SKILL.md'), /바로가기/);
    fs.symlinkSync(path.join(env.main, 'nowhere'), path.join(env.main, 'TOOLS.md'));
    assert.throws(() => resolveTarget(env.main, 'TOOLS.md'), /바로가기/);
  } finally { env.cleanup(); }
});

test('markersIntact: same marker counts and order are fine; removing, duplicating or flipping a marker is not', () => {
  const text = '앞\n<!-- self-improve:start -->\n- a\n<!-- self-improve:end -->\n<!-- self-improve-hook:start -->\nh\n<!-- self-improve-hook:end -->\n';
  assert.equal(markersIntact(text, text.replace('- a', '- b')), true);
  assert.equal(markersIntact(text, text.replace('<!-- self-improve:end -->\n', '')), false);
  assert.equal(markersIntact(text, text.replace('<!-- self-improve-hook:start -->\n', '')), false);
  assert.equal(markersIntact(text, `${text}<!-- self-improve:start -->\n`), false);
  assert.equal(markersIntact(text, text.replace('<!-- self-improve:start -->', '<!-- self-improve:END -->')), false);
  const flipped = '<!-- self-improve:end -->\n- a\n<!-- self-improve:start -->\n';
  assert.equal(markersIntact(text, text.replace(/<!-- self-improve:start -->\n- a\n<!-- self-improve:end -->\n/, flipped)), false);
  assert.equal(markersIntact('표시 없는 파일\n', '표시 없는 파일 고침\n'), true);
  assert.equal(markersIntact('표시 없는 파일\n', '<!-- self-improve:start -->\n'), false);
});

test('resolveTarget refuses the self-improve skill itself, even if the file exists', () => {
  const env = setup();
  try {
    fs.mkdirSync(path.join(env.main, 'skills', 'self-improve', 'references'), { recursive: true });
    fs.writeFileSync(path.join(env.main, 'skills', 'self-improve', 'SKILL.md'), '# 성장 노트\n');
    for (const rel of ['skills/self-improve/SKILL.md', 'skills/self-improve/references/a.md', 'skills/self-improve/new.md'])
      assert.throws(() => resolveTarget(env.main, rel), new RegExp(`성장 노트 스킬 자신은 고칠 수 없어요: ${rel.replaceAll('.', '\\.')}`), rel);
    assert.equal(resolveTarget(env.main, 'skills/self-improve-notes/SKILL.md'), path.join(env.main, 'skills', 'self-improve-notes', 'SKILL.md'));
  } finally { env.cleanup(); }
});
