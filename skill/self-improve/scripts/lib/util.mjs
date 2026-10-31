// 성장 노트 공용 유틸. npm 의존성 없음.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function fail(message, code = 1) {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
}

export function runMain(fn) {
  try { fn(); } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(error.exitCode ?? 1);
  }
}

export function nowFrom(value) {
  if (!value) return new Date();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) fail(`invalid --now: ${value}`);
  return date;
}

const KST_MS = 9 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;
export function kstDate(date) { return new Date(date.getTime() + KST_MS).toISOString().slice(0, 10); }
export function kstISO(date) { return new Date(date.getTime() + KST_MS).toISOString().replace(/\.\d{3}Z$/, '+09:00'); }

export function sha256(content) { return crypto.createHash('sha256').update(content).digest('hex'); }
export function fileSha(file) { return fs.existsSync(file) ? sha256(fs.readFileSync(file)) : 'absent'; }

// 임시 파일에 쓴 뒤 rename — 중간에 끊겨도 반쪽 파일이 남지 않는다. 기존 파일 권한은 유지한다.
export function atomicWrite(file, content, mode) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const finalMode = mode ?? (fs.existsSync(file) ? fs.statSync(file).mode & 0o777 : 0o644);
  const temporary = `${file}.${process.pid}.${crypto.randomBytes(3).toString('hex')}.tmp`;
  fs.writeFileSync(temporary, content, { mode: finalMode, flag: 'wx' });
  fs.chmodSync(temporary, finalMode);
  fs.renameSync(temporary, file);
}

export function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').map((line, index) => [line, index]).filter(([line]) => line.trim())
    .map(([line, index]) => {
      try { return JSON.parse(line); } catch { return fail(`broken line ${index + 1} in ${file}`); }
    });
}

// 깨진 줄은 건너뛰고 줄 번호만 알려 준다. 한 사람의 메모가 깨져도 팀 전체가 멈추지 않게 할 때 쓴다.
export function readJsonlLenient(file) {
  if (!fs.existsSync(file)) return { records: [], broken: [] };
  const records = [];
  const broken = [];
  fs.readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
    if (!line.trim()) return;
    try { records.push(JSON.parse(line)); } catch { broken.push(index + 1); }
  });
  return { records, broken };
}

export function appendJsonl(file, record) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600 });
}

export function newId(prefix, date) {
  return `${prefix}-${kstDate(date).replaceAll('-', '')}-${crypto.randomBytes(3).toString('hex')}`;
}

export function countOccurrences(text, needle) {
  return needle ? text.split(needle).length - 1 : 0;
}

// 같은 디스크면 rename, 다른 디스크(EXDEV)면 복사한 뒤 원본을 지운다. 지우기 전에 복사가 끝난 것만 확인하면 된다.
export function movePath(source, dest, rename = fs.renameSync) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try { rename(source, dest); } catch (error) {
    if (error.code !== 'EXDEV') throw error;
    fs.cpSync(source, dest, { recursive: true, errorOnExist: true, force: false });
    fs.rmSync(source, { recursive: true });
  }
}

// 폴더 안의 모든 파일을 상대경로(/ 구분)로 정렬해 돌려준다. 폴더 바로가기는 따라가지 않는다.
export function listFilesRelative(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRelative(abs, base));
    else out.push(path.relative(base, abs).split(path.sep).join('/'));
  }
  return out.sort();
}
