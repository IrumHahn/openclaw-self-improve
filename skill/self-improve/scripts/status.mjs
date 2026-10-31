#!/usr/bin/env node
// 성장 노트 보기: --message(저녁 제안 메시지), --show <n>(전체 보기), --weekly(주간 리포트), --json(위젯용), 없으면 현황.
import { parseArgs, requireAbs } from './lib/args.mjs';
import { withLock } from './lib/lock.mjs';
import { renderMessage, renderShow } from './lib/render.mjs';
import { renderSummary, renderWeekly, weekStats } from './lib/stats.mjs';
import { loadProposal, pendingProposals, readState, writeState } from './lib/state.mjs';
import { loadTeam } from './lib/team.mjs';
import { fail, kstISO, nowFrom, runMain } from './lib/util.mjs';

const USAGE = 'node status.mjs --workspace <main abs> [--team <abs>] [--message | --show <n> | --weekly | --json] [--now <iso>]';

runMain(() => {
  const o = parseArgs(process.argv.slice(2), { workspace: 'string', team: 'string', message: 'bool', show: 'string', weekly: 'bool', json: 'bool', now: 'string' }, USAGE);
  const workspace = requireAbs(o, 'workspace');
  const now = nowFrom(o.now);
  const modes = ['message', 'show', 'weekly', 'json'].filter(m => o[m]);
  if (modes.length > 1) fail(`한 번에 하나만: ${modes.join(', ')}`);

  if (o.message) {
    let proposals = [];
    withLock(workspace, () => {
      proposals = pendingProposals(workspace);
      if (!proposals.length) return;
      const state = readState(workspace);
      state.lastMessage = { at: kstISO(now), map: Object.fromEntries(proposals.map((p, i) => [String(i + 1), p.id])) };
      writeState(workspace, state);
    });
    if (!proposals.length) return;
    process.stdout.write(renderMessage(proposals, now));
    return;
  }
  if (o.show) {
    process.stdout.write(renderShow(loadProposal(workspace, { number: o.show })));
    return;
  }
  const stats = weekStats(workspace, loadTeam(o.team, workspace), now);
  if (o.weekly) { process.stdout.write(renderWeekly(stats)); return; }
  if (o.json) {
    const { week, notesTotal, notesThisWeek, applied, rejected, pending, newSkills } = stats;
    console.log(JSON.stringify({ week, notesTotal, notesThisWeek, applied, rejected, pending, newSkills }, null, 2));
    return;
  }
  process.stdout.write(renderSummary(stats));
});
