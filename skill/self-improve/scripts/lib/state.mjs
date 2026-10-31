import fs from 'node:fs';
import path from 'node:path';
import { atomicWrite, fail, readJsonlLenient } from './util.mjs';

export const DAILY_CAP = 3;
export const COOLDOWN_DAYS = 14;
export const EXPIRE_DAYS = 7;
export const ARCHIVE_DAYS = 30;
export const PROPOSAL_ID_RE = /^p-\d{8}-[0-9a-f]{6}$/;

export function learningsPaths(workspace) {
  const dir = path.join(workspace, 'learnings');
  return {
    dir,
    notes: path.join(dir, 'notes.jsonl'),
    pending: path.join(dir, 'pending'),
    ledger: path.join(dir, 'ledger.jsonl'),
    backups: path.join(dir, 'backups'),
    state: path.join(dir, 'state.json'),
    archive: path.join(dir, 'archive'),
  };
}

export function defaultState() {
  return { version: 1, processed: [], cooldowns: {}, lastMessage: null };
}

export function readState(workspace) {
  const file = learningsPaths(workspace).state;
  if (!fs.existsSync(file)) return defaultState();
  let state;
  try { state = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { fail(`state file is broken: ${file}`); }
  if (state?.version !== 1 || !Array.isArray(state.processed) || !state.cooldowns || typeof state.cooldowns !== 'object' || Array.isArray(state.cooldowns)) fail(`state file is invalid: ${file}`);
  return { ...defaultState(), ...state };
}

export function writeState(workspace, state) {
  atomicWrite(learningsPaths(workspace).state, `${JSON.stringify(state, null, 2)}\n`, 0o600);
}

// pending/*.json 을 읽어 { proposals, broken } 으로 나눈다. 깨진 파일 하나가 전체를 멈추지 않게 한다.
function scanProposals(workspace) {
  const dir = learningsPaths(workspace).pending;
  const proposals = [];
  const broken = [];
  if (!fs.existsSync(dir)) return { proposals, broken };
  for (const f of fs.readdirSync(dir).filter(name => name.endsWith('.json')).sort()) {
    try {
      const p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (p && typeof p.id === 'string' && typeof p.createdAt === 'string' && typeof p.status === 'string') proposals.push(p);
      else broken.push(f);
    } catch { broken.push(f); }
  }
  proposals.sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id.localeCompare(b.id));
  return { proposals, broken };
}

export function listProposals(workspace) { return scanProposals(workspace).proposals; }
export function brokenProposals(workspace) { return scanProposals(workspace).broken; }

export function pendingProposals(workspace) {
  return listProposals(workspace).filter(p => p.status === 'pending');
}

export function saveProposal(workspace, proposal) {
  atomicWrite(path.join(learningsPaths(workspace).pending, `${proposal.id}.json`), `${JSON.stringify(proposal, null, 2)}\n`, 0o600);
}

// --id 또는 --number(마지막 저녁 메시지의 번호)로 제안을 찾는다.
export function loadProposal(workspace, { id, number }) {
  let proposalId = id;
  if (!proposalId && number) {
    proposalId = readState(workspace).lastMessage?.map?.[String(number)];
    if (!proposalId) fail(`번호 ${number}에 해당하는 제안이 없어요 (no proposal for number ${number})`);
  }
  if (!proposalId) fail('--id or --number is required');
  if (!PROPOSAL_ID_RE.test(proposalId)) fail(`invalid proposal id: ${proposalId}`);
  const file = path.join(learningsPaths(workspace).pending, `${proposalId}.json`);
  if (!fs.existsSync(file)) fail(`proposal not found: ${proposalId}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// 장부는 엄격하게 읽는다(기록이 빠지면 하루 3건 제한·되돌리기가 틀어진다). 망가진 줄이 있으면 고치는 방법을 알려 주고 멈춘다.
export function readLedger(workspace) {
  const { records, broken } = readJsonlLenient(learningsPaths(workspace).ledger);
  if (broken.length) fail(`장부(ledger.jsonl) ${broken[0]}번째 줄이 망가졌어요. 그 줄을 지우면 다시 돌아가요 (broken ledger line ${broken[0]}: ${learningsPaths(workspace).ledger})`);
  return records;
}

export function numberOf(workspace, proposalId) {
  const map = readState(workspace).lastMessage?.map ?? {};
  return Object.entries(map).find(([, value]) => value === proposalId)?.[0] ?? null;
}
