#!/usr/bin/env node
// 배운 점 1건을 <workspace>/learnings/notes.jsonl 에 추가한다. 팀원·총괄 모두 자기 workspace 에만 쓴다.
import fs from 'node:fs';
import { parseArgs, requireAbs } from './lib/args.mjs';
import { validateNote } from './lib/notes.mjs';
import { redact } from './lib/redact.mjs';
import { learningsPaths } from './lib/state.mjs';
import { appendJsonl, fail, kstISO, newId, nowFrom, readJsonlLenient, runMain } from './lib/util.mjs';

const USAGE = `node note.mjs --workspace <abs> --agent <id> --kind <kind> --key <key> --lesson <text> --target <target> [--evidence <text>] [--now <iso>]
node note.mjs --workspace <abs> --list-keys`;

runMain(() => {
  const o = parseArgs(process.argv.slice(2), { workspace: 'string', agent: 'string', kind: 'string', key: 'string', lesson: 'string', target: 'string', evidence: 'string', now: 'string', 'list-keys': 'bool' }, USAGE);
  const workspace = requireAbs(o, 'workspace');
  if (!fs.existsSync(workspace)) fail(`workspace does not exist: ${workspace}`);
  const file = learningsPaths(workspace).notes;

  if (o['list-keys']) {
    const keys = new Map();
    for (const n of readJsonlLenient(file).records) {
      if (!n || typeof n !== 'object' || typeof n.key !== 'string') continue;
      const entry = keys.get(n.key) ?? { key: n.key, kind: n.kind, count: 0, lesson: n.lesson };
      entry.count += 1; entry.lesson = n.lesson; entry.kind = n.kind;
      keys.set(n.key, entry);
    }
    console.log(JSON.stringify([...keys.values()].sort((a, b) => a.key.localeCompare(b.key)), null, 2));
    return;
  }

  for (const name of ['agent', 'kind', 'key', 'lesson', 'target']) if (!o[name]) fail(`--${name} is required\n${USAGE}`);
  const now = nowFrom(o.now);
  const lesson = redact(o.lesson.replace(/\s+/g, ' ').trim());
  const evidence = redact((o.evidence ?? '').replace(/\s+/g, ' ').trim());
  const record = { id: newId('n', now), ts: kstISO(now), agent: o.agent, kind: o.kind, key: o.key, lesson: lesson.text, target: o.target, evidence: evidence.text };
  validateNote(record);
  appendJsonl(file, record);
  console.log(JSON.stringify({ saved: true, id: record.id, redacted: lesson.redacted || evidence.redacted }, null, 2));
});
