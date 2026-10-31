import { fail } from './util.mjs';

export const START = '<!-- self-improve:start -->';
export const END = '<!-- self-improve:end -->';
export const HOOK_START = '<!-- self-improve-hook:start -->';
export const HOOK_END = '<!-- self-improve-hook:end -->';
export const MAX_LINES = 30;
export const MARKERS_ERASED = '성장 노트 구역 표시가 지워지는 수정은 할 수 없어요';

function positions(text, marker) {
  const found = [];
  for (let at = text.indexOf(marker); at !== -1; at = text.indexOf(marker, at + marker.length)) found.push(at);
  return found;
}

function inOrder(starts, ends) {
  return starts.every((start, i) => start < ends[i] && (i + 1 >= starts.length || ends[i] < starts[i + 1]));
}

// 수정 뒤에도 구역 표시(배운 규칙 · 행동 구역)가 원래대로 남아 있는지 본다. 개수가 같고, 원래 짝이 맞았다면 여전히 짝이 맞아야 한다.
export function markersIntact(before, after) {
  for (const [start, end] of [[START, END], [HOOK_START, HOOK_END]]) {
    const b = [positions(before, start), positions(before, end)];
    const a = [positions(after, start), positions(after, end)];
    if (a[0].length !== b[0].length || a[1].length !== b[1].length) return false;
    const wasPaired = b[0].length === b[1].length && inOrder(...b);
    if (wasPaired && !inOrder(...a)) return false;
  }
  return true;
}

export function titleFor(rel) {
  return rel === 'USER.md' ? '## 성장 노트 — 주인에 대해 (추정 포함)' : '## 성장 노트 — 배운 규칙';
}

export function findSection(text) {
  const start = text.indexOf(START);
  if (start === -1) return null;
  const end = text.indexOf(END, start);
  if (end === -1) fail('성장 노트 구역의 끝 표시가 없어요 (section end marker missing)');
  return { start, end };
}

export function sectionRules(text) {
  const section = findSection(text);
  if (!section) return [];
  return text.slice(section.start + START.length, section.end).split('\n').filter(line => line.startsWith('- '));
}

// 구역이 없으면 파일 끝에 만들고, 있으면 끝 표시 바로 앞에 한 줄 추가한다. 구역 밖은 건드리지 않는다.
export function appendRule(text, rel, line) {
  const clean = String(line).replace(/\s+/g, ' ').trim();
  if (!clean) fail('추가할 규칙이 비어 있어요');
  const bullet = `- ${clean}`;
  const section = findSection(text);
  if (!section) {
    const separator = text === '' ? '' : text.endsWith('\n') ? '\n' : '\n\n';
    return `${text}${separator}${START}\n${titleFor(rel)}\n${bullet}\n${END}\n`;
  }
  if (sectionRules(text).length >= MAX_LINES) fail(`성장 노트 구역이 가득 찼어요(${MAX_LINES}줄). 주간 정리에서 합친 뒤 추가할게요 (section full)`, 3);
  const before = text.slice(0, section.end);
  return `${before}${before.endsWith('\n') ? '' : '\n'}${bullet}\n${text.slice(section.end)}`;
}
