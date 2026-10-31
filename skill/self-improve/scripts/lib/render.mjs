import { END, HOOK_END, HOOK_START, START } from './section.mjs';
import { kstDate } from './util.mjs';

// 수강생에게 보이는 문구. 개발 용어(파일 경로·id·sha)를 넣지 않는다.
const MARKER_LINES = new Set([START, END, HOOK_START, HOOK_END]);
// 구역 표시 줄(주석)은 수강생에게 의미가 없으므로 전/후 보기에서 뺀다.
export function stripMarkers(text) {
  return String(text).split('\n').filter(line => !MARKER_LINES.has(line.trim())).join('\n');
}
const FILE_LABEL = { 'AGENTS.md': '업무 규칙', 'TOOLS.md': '도구 메모', 'SOUL.md': '성격·말투', 'USER.md': '주인에 대해' };

export function whoLabel(p) { return p.agentIsMain ? '총괄' : `팀원 '${p.agent}'`; }

export function scopeLabel(p) {
  if (p.type === 'new_skill') return `새 스킬 제안 · 담당 ${whoLabel(p)}`;
  const skill = p.file.match(/^skills\/([^/]+)\//);
  const what = skill ? `${skill[1]} 스킬` : FILE_LABEL[p.file];
  return `${what}${p.kind === 'user_trait' ? ' · 추정' : ''} · ${whoLabel(p)}`;
}

export function clip(text, max = 120) {
  const flat = String(text).replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

export function renderItem(number, p) {
  const lines = [`${number}) [${scopeLabel(p)}]`];
  if (p.type === 'append') {
    lines.push(`   "${clip(p.line)}"`);
    if (p.kind === 'user_trait') lines.push('   이렇게 짐작했는데 맞나요?');
  } else if (p.type === 'replace') {
    lines.push(`   전: "${clip(stripMarkers(p.old))}"`, `   후: "${clip(stripMarkers(p.new))}"`);
  } else {
    lines.push(`   ${p.skillName} — ${clip(p.summary)}`, `   전체 초안: "${number} 보여 줘"`);
  }
  lines.push(`   이유: ${clip(p.reason)}`);
  return lines.join('\n');
}

function headerFor(proposals, now) {
  const today = kstDate(now);
  const older = proposals.filter(p => kstDate(new Date(p.createdAt)) !== today).length;
  return older === 0
    ? `🌱 성장 노트 — 오늘 개선 제안 ${proposals.length}건`
    : `🌱 성장 노트 — 개선 제안 ${proposals.length}건 (지난 제안 ${older}건 포함)`;
}

export function renderMessage(proposals, now = new Date()) {
  if (!proposals.length) return '';
  const footer = proposals.length === 1
    ? '답장: "1 승인" · "1 거절" · "1 나중에"'
    : '답장: "1 승인" · "2 거절" · "전부 승인" · "1 나중에"';
  return `${[headerFor(proposals, now), '', ...proposals.map((p, i) => `${renderItem(i + 1, p)}\n`), footer].join('\n')}\n`;
}

export function renderShow(p) {
  if (p.type === 'new_skill') return p.skillMd;
  if (p.type === 'replace') return `전:\n${stripMarkers(p.old)}\n\n후:\n${stripMarkers(p.new)}\n`;
  return `${p.line}\n`;
}
