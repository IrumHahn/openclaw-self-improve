import fs from 'node:fs';
import path from 'node:path';
import { learningsPaths } from './state.mjs';
import { fail } from './util.mjs';

export const LOCK_STALE_MS = 10 * 60 * 1000;
const BUSY = '다른 정리 작업이 진행 중이에요. 잠시 뒤 다시 해 주세요';

// 같은 총괄 workspace 에서 정리 작업(제안·반영·거절·되돌리기·보관)이 동시에 돌지 않게 한다.
// 10분 넘은 잠금 파일은 중간에 멈춘 흔적으로 보고 지운 뒤 다시 잡는다.
export function withLock(workspace, fn) {
  const { dir } = learningsPaths(workspace);
  const file = path.join(dir, '.lock');
  fs.mkdirSync(dir, { recursive: true });
  const take = () => fs.openSync(file, 'wx', 0o600);
  let fd;
  try { fd = take(); } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let age = 0;
    try { age = Date.now() - fs.statSync(file).mtimeMs; } catch { age = LOCK_STALE_MS; }
    if (age < LOCK_STALE_MS) fail(BUSY, 5);
    fs.rmSync(file, { force: true });
    try { fd = take(); } catch { fail(BUSY, 5); }
  }
  try {
    fs.writeSync(fd, `${process.pid}\n`);
    return fn();
  } finally {
    fs.closeSync(fd);
    fs.rmSync(file, { force: true });
  }
}
