import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { message, note, propose, runJson, setup } from './helpers.mjs';

test('reject sets status, 14-day cooldown and ledger; collect then reports cooldown until it ends', () => {
  const env = setup();
  try {
    propose(env, { type: 'append', agent: 'main', key: 'tone-x', kind: 'correction', reason: 'r', file: 'SOUL.md', line: '반말' });
    message(env);
    const out = runJson('reject.mjs', ['--workspace', env.main, '--number', '1', '--now', '2026-11-02T22:05:00+09:00']);
    assert.equal(out.message, '거절했어요. 같은 제안은 2주 동안 다시 하지 않을게요.');
    const state = JSON.parse(fs.readFileSync(path.join(env.main, 'learnings', 'state.json'), 'utf8'));
    assert.equal(state.cooldowns['tone-x'], '2026-11-16T22:05:00+09:00');
    note(env.main, 'main', 'correction', 'tone-x', '반말', 'SOUL.md', '2026-11-03T10:00:00+09:00');
    const during = runJson('collect.mjs', ['--workspace', env.main, '--team', env.team, '--now', '2026-11-10T22:00:00+09:00']);
    assert.equal(during.groups[0].reason, 'cooldown');
    const after = runJson('collect.mjs', ['--workspace', env.main, '--team', env.team, '--now', '2026-11-17T22:00:00+09:00']);
    assert.equal(after.groups[0].eligible, true);
  } finally { env.cleanup(); }
});
