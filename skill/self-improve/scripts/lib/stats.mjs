import fs from 'node:fs';
import path from 'node:path';
import { KINDS } from './notes.mjs';
import { learningsPaths, listProposals, pendingProposals, readLedger } from './state.mjs';
import { DAY_MS, kstDate, readJsonlLenient } from './util.mjs';

// 이번 주 = 오늘(KST)을 포함한 7일: 6일 전 KST 00:00 부터 지금까지.
export function weekWindow(now) {
  const from = kstDate(new Date(now.getTime() - 6 * DAY_MS));
  return { from, to: kstDate(now), since: new Date(`${from}T00:00:00+09:00`).getTime(), until: now.getTime() };
}

export function weekStats(workspace, team, now) {
  const { from, to, since, until } = weekWindow(now);
  const byKind = {};
  const perAgent = [];
  const wishes = [];
  let notesTotal = 0;
  let notesThisWeek = 0;
  for (const agent of team) {
    if (!fs.existsSync(agent.workspace)) continue;
    let mine = 0;
    for (const n of readJsonlLenient(learningsPaths(agent.workspace).notes).records) {
      if (!n || typeof n !== 'object' || typeof n.kind !== 'string') continue; // 깨진 메모는 세지 않는다
      notesTotal += 1;
      const at = new Date(n.ts).getTime();
      if (Number.isNaN(at) || at < since || at > until) continue;
      notesThisWeek += 1; mine += 1;
      byKind[n.kind] = (byKind[n.kind] ?? 0) + 1;
      if (n.kind === 'wish' && typeof n.lesson === 'string' && !wishes.includes(n.lesson)) wishes.push(n.lesson);
    }
    if (mine) perAgent.push({ id: agent.id, isMain: agent.isMain, count: mine });
  }
  const all = readLedger(workspace);
  const rolledBackIds = new Set(all.filter(e => e.action === 'rolled_back').map(e => e.id));
  const inWindow = all.filter(e => { const at = new Date(e.at).getTime(); return at >= since && at <= until; });
  const count = action => inWindow.filter(e => e.action === action).length;
  const appliedKept = inWindow.filter(e => e.action === 'applied' && !rolledBackIds.has(e.id));
  const skillNames = new Map(listProposals(workspace).filter(p => p.type === 'new_skill').map(p => [p.id, p.skillName]));
  return {
    week: { from, to },
    notesTotal, notesThisWeek, byKind, perAgent, wishes,
    applied: appliedKept.length, rejected: count('rejected'), expired: count('expired'), rolledBack: count('rolled_back'),
    pending: pendingProposals(workspace).length,
    newSkills: appliedKept.filter(e => e.type === 'new_skill').map(e => skillNames.get(e.id) ?? (e.created ? path.basename(e.created) : e.key)),
  };
}

const md = iso => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
const ORDER = ['correction', 'failure', 'better_way', 'repeat_task', 'user_trait', 'wish'];
const SHORT = { ...Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, v.ko])), user_trait: '대표님 성향' };

export function renderWeekly(s) {
  const head = `🌱 성장 노트 — 이번 주 성장 리포트 (${md(s.week.from)}~${md(s.week.to)})`;
  if (!s.notesThisWeek && !s.applied && !s.rejected && !s.expired && !s.rolledBack) {
    return `${head}\n\n이번 주는 기록된 배운 점이 없어요. 비서에게 일을 맡기고 고쳐 줄수록 성장 노트가 쌓여요.\n`;
  }
  const lines = [head, ''];
  if (s.notesThisWeek) {
    const kinds = ORDER.filter(k => s.byKind[k]).map(k => `${SHORT[k]} ${s.byKind[k]}`).join(' · ');
    lines.push(kinds ? `배운 점 ${s.notesThisWeek}개 — ${kinds}` : `배운 점 ${s.notesThisWeek}개`);
  }
  let result = `반영된 개선 ${s.applied}건 · 거절 ${s.rejected}건 · 대기 ${s.pending}건`;
  if (s.expired > 0) result += ` · 만료 ${s.expired}건`;
  if (s.rolledBack > 0) result += ` · 되돌림 ${s.rolledBack}건`;
  lines.push(result);
  if (s.newSkills.length) lines.push(`새 스킬: ${s.newSkills.map(n => `${n}(시험판)`).join(', ')}`);
  if (s.perAgent.length) lines.push('', `팀원별: ${s.perAgent.map(a => `${a.isMain ? '총괄' : `'${a.id}'`} ${a.count}`).join(' · ')}`);
  if (s.wishes.length) lines.push('', '바라는 기능', ...s.wishes.map(w => `- ${w}`));
  return `${lines.join('\n')}\n`;
}

export function renderSummary(s) {
  return `🌱 성장 노트 현황\n\n쌓인 배운 점 ${s.notesTotal}개 (이번 주 ${s.notesThisWeek}개)\n이번 주 반영 ${s.applied}건 · 승인 대기 ${s.pending}건\n`;
}
