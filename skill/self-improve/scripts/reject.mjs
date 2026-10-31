#!/usr/bin/env node
// 주인이 거절한 제안을 닫고, 같은 열쇠(key)를 14일 동안 다시 제안하지 않게 한다.
import { parseArgs, requireAbs } from './lib/args.mjs';
import { withLock } from './lib/lock.mjs';
import { COOLDOWN_DAYS, learningsPaths, loadProposal, readState, saveProposal, writeState } from './lib/state.mjs';
import { appendJsonl, DAY_MS, fail, kstISO, nowFrom, runMain } from './lib/util.mjs';

const USAGE = 'node reject.mjs --workspace <main abs> (--id <id> | --number <n>) [--now <iso>]';

runMain(() => {
  const o = parseArgs(process.argv.slice(2), { workspace: 'string', id: 'string', number: 'string', now: 'string' }, USAGE);
  const workspace = requireAbs(o, 'workspace');
  withLock(workspace, () => {
    const now = nowFrom(o.now);
    const p = loadProposal(workspace, { id: o.id, number: o.number });
    if (p.status !== 'pending') fail(`이미 처리된 제안이에요 (${p.status})`);
    p.status = 'rejected';
    p.rejectedAt = kstISO(now);
    saveProposal(workspace, p);
    const state = readState(workspace);
    state.cooldowns[p.key] = kstISO(new Date(now.getTime() + COOLDOWN_DAYS * DAY_MS));
    writeState(workspace, state);
    appendJsonl(learningsPaths(workspace).ledger, { at: p.rejectedAt, action: 'rejected', id: p.id, type: p.type, agent: p.agent, key: p.key });
    console.log(JSON.stringify({ ok: true, id: p.id, message: '거절했어요. 같은 제안은 2주 동안 다시 하지 않을게요.' }, null, 2));
  });
});
