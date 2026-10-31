import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { appendJsonl, atomicWrite, fileSha, kstDate, kstISO, listFilesRelative, movePath, newId, readJsonl, sha256 } from '../skill/self-improve/scripts/lib/util.mjs';
import { parseArgs } from '../skill/self-improve/scripts/lib/args.mjs';

test('KST date/ISO, sha256, id format', () => {
  const d = new Date('2026-11-01T15:30:00Z');
  assert.equal(kstDate(d), '2026-11-02');
  assert.equal(kstISO(d), '2026-11-02T00:30:00+09:00');
  assert.equal(sha256('a'), 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb');
  assert.match(newId('p', d), /^p-20261102-[0-9a-f]{6}$/);
});

test('atomicWrite keeps existing mode, jsonl append/read, fileSha absent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'si-util-'));
  try {
    const f = path.join(dir, 'a', 'x.md');
    assert.equal(fileSha(f), 'absent');
    atomicWrite(f, 'one');
    assert.equal(fs.statSync(f).mode & 0o777, 0o644);
    fs.chmodSync(f, 0o640);
    atomicWrite(f, 'two');
    assert.equal(fs.readFileSync(f, 'utf8'), 'two');
    assert.equal(fs.statSync(f).mode & 0o777, 0o640);
    const j = path.join(dir, 'n.jsonl');
    appendJsonl(j, { a: 1 }); appendJsonl(j, { a: 2 });
    assert.deepEqual(readJsonl(j), [{ a: 1 }, { a: 2 }]);
    fs.appendFileSync(j, '{broken\n');
    assert.throws(() => readJsonl(j), /broken line 3/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('parseArgs: string/bool, unknown option, missing value', () => {
  const spec = { workspace: 'string', all: 'bool' };
  assert.deepEqual(parseArgs(['--workspace', '/x', '--all'], spec, 'usage'), { workspace: '/x', all: true });
  assert.throws(() => parseArgs(['--nope'], spec, 'usage'), /unknown option: --nope/);
  assert.throws(() => parseArgs(['--workspace'], spec, 'usage'), /missing value for --workspace/);
});

test('movePath renames; on EXDEV it copies the folder then removes the source; other errors propagate', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'si-move-'));
  try {
    const src = path.join(dir, 'src');
    fs.mkdirSync(path.join(src, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(src, 'a.txt'), 'A');
    fs.writeFileSync(path.join(src, 'sub', 'b.txt'), 'B');
    assert.deepEqual(listFilesRelative(src), ['a.txt', 'sub/b.txt']);

    const exdev = () => { throw Object.assign(new Error('cross-device'), { code: 'EXDEV' }); };
    const dest = path.join(dir, 'x', 'y', 'dest');
    movePath(src, dest, exdev);
    assert.equal(fs.existsSync(src), false);
    assert.deepEqual(listFilesRelative(dest), ['a.txt', 'sub/b.txt']);

    const single = path.join(dir, 'one.txt');
    fs.writeFileSync(single, '1');
    movePath(single, path.join(dir, 'z', 'one.txt'), exdev);
    assert.equal(fs.readFileSync(path.join(dir, 'z', 'one.txt'), 'utf8'), '1');
    assert.equal(fs.existsSync(single), false);

    const other = () => { throw Object.assign(new Error('nope'), { code: 'EACCES' }); };
    fs.writeFileSync(single, '2');
    assert.throws(() => movePath(single, path.join(dir, 'q', 'one.txt'), other), /nope/);
    assert.equal(fs.existsSync(single), true);
    movePath(single, path.join(dir, 'real', 'one.txt'));
    assert.equal(fs.readFileSync(path.join(dir, 'real', 'one.txt'), 'utf8'), '2');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
