#!/usr/bin/env node
// 저녁 정리 1단계: 팀 전원의 미처리 메모를 열쇠(key)별로 묶고 제안 기준을 판정해 JSON 으로 낸다. 파일을 쓰지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, requireAbs } from './lib/args.mjs';
import { KINDS } from './lib/notes.mjs';
import { sectionRules } from './lib/section.mjs';
import { DAILY_CAP, brokenProposals, learningsPaths, pendingProposals, readLedger, readState } from './lib/state.mjs';
import { loadTeam } from './lib/team.mjs';
import { kstDate, kstISO, nowFrom, readJsonlLenient, runMain } from './lib/util.mjs';

const USAGE = 'node collect.mjs --workspace <main abs> [--team <abs>] [--now <iso>]';
const RULE_FILES = ['AGENTS.md', 'TOOLS.md', 'SOUL.md', 'USER.md'];
const NEAR_FULL = 25;

function mostCommon(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

runMain(() => {
  const o = parseArgs(process.argv.slice(2), { workspace: 'string', team: 'string', now: 'string' }, USAGE);
  const workspace = requireAbs(o, 'workspace');
  const now = nowFrom(o.now);
  const team = loadTeam(o.team, workspace);
  const state = readState(workspace);
  const processed = new Set(state.processed);
  const pendingKeys = new Set(pendingProposals(workspace).map(p => p.key));

  const groups = new Map();
  const missing = [];
  const sections = [];
  const skipped = [];
  for (const agent of team) {
    if (!fs.existsSync(agent.workspace)) { missing.push(agent.id); continue; }
    const read = readJsonlLenient(learningsPaths(agent.workspace).notes);
    if (read.broken.length) skipped.push({ agent: agent.id, file: 'notes.jsonl', lines: read.broken });
    for (const n of read.records) {
      if (!n || typeof n.id !== 'string' || typeof n.key !== 'string') continue;
      if (processed.has(n.id)) continue;
      const group = groups.get(n.key) ?? { key: n.key, notes: [] };
      group.notes.push({ ...n, agent: agent.id });
      groups.set(n.key, group);
    }
    for (const file of RULE_FILES) {
      const abs = path.join(agent.workspace, file);
      if (!fs.existsSync(abs)) continue;
      let lines;
      try { lines = sectionRules(fs.readFileSync(abs, 'utf8')).length; } catch { sections.push({ agent: agent.id, file, error: 'end marker missing' }); continue; }
      if (lines >= NEAR_FULL) sections.push({ agent: agent.id, file, lines });
    }
  }

  const out = [];
  for (const group of groups.values()) {
    const kind = mostCommon(group.notes.map(n => n.kind));
    const meta = KINDS[kind] ?? KINDS.wish;
    const count = group.notes.length;
    let reason = null;
    if (meta.threshold === null) reason = 'wish';
    else if (count < meta.threshold) reason = 'below';
    else if (pendingKeys.has(group.key)) reason = 'pending';
    else if (state.cooldowns[group.key] && new Date(state.cooldowns[group.key]) > now) reason = 'cooldown';
    out.push({
      key: group.key, kind, kindKo: meta.ko, count, threshold: meta.threshold, eligible: reason === null, reason, priority: meta.priority,
      agents: [...new Set(group.notes.map(n => n.agent))],
      target: mostCommon(group.notes.map(n => n.target)),
      lessons: [...new Set(group.notes.map(n => n.lesson))],
      evidence: group.notes.map(n => n.evidence).filter(Boolean).slice(-3),
      noteIds: group.notes.map(n => n.id),
    });
  }
  out.sort((a, b) => (Number(b.eligible) - Number(a.eligible)) || (a.priority - b.priority) || (b.count - a.count) || a.key.localeCompare(b.key));

  const today = kstDate(now);
  const proposedToday = readLedger(workspace).filter(e => e.action === 'proposed' && kstDate(new Date(e.at)) === today).length;
  console.log(JSON.stringify({ now: kstISO(now), slots: Math.max(0, DAILY_CAP - proposedToday), groups: out, missing, sections, skipped, brokenPending: brokenProposals(workspace) }, null, 2));
});
