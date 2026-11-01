import { fail } from './util.mjs';

// threshold: 저녁 정리에서 제안할 최소 횟수(null = 제안 안 함), priority: 낮을수록 먼저
export const KINDS = {
  correction: { ko: '교정', threshold: 1, priority: 0 },
  failure: { ko: '실패', threshold: 2, priority: 1 },
  better_way: { ko: '더 나은 방법', threshold: 2, priority: 1 },
  user_trait: { ko: '대표님 성향(추정)', threshold: 3, priority: 2 },
  repeat_task: { ko: '반복 작업', threshold: 3, priority: 3 },
  wish: { ko: '바라는 기능', threshold: null, priority: 9 },
};
export const KEY_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;
export const AGENT_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
export const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;
const SKILL_NAME_SOURCE = SKILL_NAME_RE.source.slice(1, -1);
export const TARGET_RE = new RegExp(`^(AGENTS\\.md|TOOLS\\.md|SOUL\\.md|USER\\.md|new-skill|skill:${SKILL_NAME_SOURCE})$`);
export const MAX_TEXT = 200;

export function validateNote(note) {
  if (!AGENT_RE.test(note.agent ?? '')) fail(`invalid --agent: ${note.agent}`);
  if (!KINDS[note.kind]) fail(`--kind 는 ${Object.keys(KINDS).join(' | ')} 중 하나예요 (got ${note.kind})`);
  if (!KEY_RE.test(note.key ?? '')) fail(`--key 는 영문 소문자·숫자·하이픈 2~64자예요 (got ${note.key})`);
  if (!TARGET_RE.test(note.target ?? '')) fail(`--target 은 AGENTS.md | TOOLS.md | SOUL.md | USER.md | skill:<이름> | new-skill 이에요 (got ${note.target})`);
  if (!note.lesson) fail('--lesson 이 비어 있어요');
  if (note.lesson.length > MAX_TEXT) fail(`--lesson 은 ${MAX_TEXT}자 이하예요 (교훈 한 문장)`);
  if ((note.evidence ?? '').length > MAX_TEXT) fail(`--evidence 는 ${MAX_TEXT}자 이하예요`);
}
