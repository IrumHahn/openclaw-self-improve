#!/usr/bin/env node
// 저녁 정리 2단계: 총괄이 쓴 수정안 1건을 검증해 learnings/pending/ 에 올린다. 대상 파일은 건드리지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, requireAbs } from './lib/args.mjs';
import { isRuleFile, resolveTarget } from './lib/guard.mjs';
import { KEY_RE, KINDS, SKILL_NAME_RE } from './lib/notes.mjs';
import { withLock } from './lib/lock.mjs';
import { redact } from './lib/redact.mjs';
import { MARKERS_ERASED, MAX_LINES, markersIntact, sectionRules } from './lib/section.mjs';
import { DAILY_CAP, learningsPaths, pendingProposals, readLedger, readState, saveProposal, writeState } from './lib/state.mjs';
import { findAgent, loadTeam } from './lib/team.mjs';
import { appendJsonl, countOccurrences, fail, fileSha, kstDate, kstISO, newId, nowFrom, runMain } from './lib/util.mjs';

const USAGE = 'node propose.mjs --workspace <main abs> --file <proposal.json abs> [--team <abs>] [--now <iso>]';
const SECRET_MESSAGE = '스킬 초안에 비밀번호·토큰·개인정보처럼 보이는 내용이 있어요. 빼고 다시 써 주세요';
const oneLine = value => String(value ?? '').replace(/\s+/g, ' ').trim();

runMain(() => {
  const o = parseArgs(process.argv.slice(2), { workspace: 'string', file: 'string', team: 'string', now: 'string' }, USAGE);
  const workspace = requireAbs(o, 'workspace');
  withLock(workspace, () => {
    const input = JSON.parse(fs.readFileSync(requireAbs(o, 'file'), 'utf8'));
    const now = nowFrom(o.now);
    const member = findAgent(loadTeam(o.team, workspace), input.agent);

    if (!['append', 'replace', 'new_skill'].includes(input.type)) fail(`type 은 append | replace | new_skill 이에요 (got ${input.type})`);
    if (!KEY_RE.test(input.key ?? '')) fail(`invalid key: ${input.key}`);
    if (!KINDS[input.kind]) fail(`invalid kind: ${input.kind}`);
    const reason = oneLine(input.reason);
    if (!reason || reason.length > 200) fail('reason 은 1~200자예요');
    if (pendingProposals(workspace).some(p => p.key === input.key)) fail(`이미 대기 중인 제안이 있어요: ${input.key} (already pending)`);
    const cooldownUntil = readState(workspace).cooldowns[input.key];
    if (cooldownUntil && new Date(cooldownUntil) > now) fail(`같은 제안은 거절된 뒤 2주 동안 다시 하지 않아요 (cooldown until ${cooldownUntil})`, 3);
    const today = kstDate(now);
    const proposedToday = readLedger(workspace).filter(e => e.action === 'proposed' && kstDate(new Date(e.at)) === today).length;
    if (proposedToday >= DAILY_CAP) fail(`오늘은 이미 ${DAILY_CAP}건 제안했어요. 나머지는 내일 할게요 (daily cap)`, 3);
    const noteIds = Array.isArray(input.noteIds) ? input.noteIds.filter(id => typeof id === 'string') : [];

    const proposal = {
      id: newId('p', now), createdAt: kstISO(now), status: 'pending', type: input.type,
      agent: member.id, agentIsMain: member.isMain, workspace: member.workspace,
      key: input.key, kind: input.kind, reason: redact(reason).text, noteIds,
    };

    if (input.type === 'append') {
      if (!isRuleFile(input.file)) fail('추가(append)는 AGENTS.md · TOOLS.md · SOUL.md · USER.md 에만 할 수 있어요');
      const abs = resolveTarget(member.workspace, input.file);
      const line = redact(oneLine(input.line)).text;
      if (!line || line.length > 200) fail('line 은 1~200자예요');
      const text = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
      if (sectionRules(text).length >= MAX_LINES) fail(`성장 노트 구역이 가득 찼어요(${MAX_LINES}줄). 합치기 제안을 먼저 하세요 (section full)`, 3);
      Object.assign(proposal, { file: input.file, line, baseSha: fileSha(abs) });
    } else if (input.type === 'replace') {
      const abs = resolveTarget(member.workspace, input.file);
      if (!fs.existsSync(abs)) fail(`파일이 없어요: ${input.file}`);
      const oldText = String(input.old ?? '');
      const newText = String(input.new ?? '');
      if (redact(newText).redacted) fail('바꿀 문장(new)에 비밀번호·토큰·개인정보처럼 보이는 내용이 있어요. 빼고 다시 써 주세요');
      if (!oldText || oldText === newText) fail('old 는 비어 있지 않고 new 와 달라야 해요');
      if (oldText.length > 4000 || newText.length > 4000) fail('old/new 는 4000자 이하예요');
      const fileText = fs.readFileSync(abs, 'utf8');
      const count = countOccurrences(fileText, oldText);
      if (count !== 1) fail(`바꿀 문장이 파일에 정확히 한 번 있어야 해요 (found ${count})`);
      if (!markersIntact(fileText, fileText.replace(oldText, () => newText))) fail(MARKERS_ERASED);
      Object.assign(proposal, { file: input.file, old: oldText, new: newText, baseSha: fileSha(abs) });
    } else {
      const name = String(input.skillName ?? '');
      if (!SKILL_NAME_RE.test(name)) fail(`invalid skillName: ${name}`);
      if (name === 'self-improve') fail('성장 노트 스킬 자신은 고칠 수 없어요: skills/self-improve');
      const md = String(input.skillMd ?? '').replace(/\r\n/g, '\n');
      const front = md.match(/^---\n([\s\S]*?)\n---\n/);
      if (!front) fail('SKILL.md 초안에 머리말(---)이 없어요');
      if (!new RegExp(`^name:\\s*(?:${name}|"${name}"|'${name}')\\s*$`, 'm').test(front[1])) fail('머리말 name 이 skillName 과 달라요');
      if (!/^description:.*\(시험판\)/m.test(front[1])) fail('description 에 (시험판) 표시가 필요해요');
      if (md.length > 20000) fail('SKILL.md 초안은 20000자 이하예요');
      if (redact(md).redacted) fail(SECRET_MESSAGE);
      if (fs.existsSync(path.join(member.workspace, 'skills', name))) fail(`같은 이름의 스킬이 이미 있어요: ${name}`);
      const summary = oneLine(input.summary);
      if (!summary || summary.length > 200) fail('summary 는 1~200자예요');
      Object.assign(proposal, { skillName: name, summary: redact(summary).text, skillMd: md });
    }

    saveProposal(workspace, proposal);
    appendJsonl(learningsPaths(workspace).ledger, { at: proposal.createdAt, action: 'proposed', id: proposal.id, type: proposal.type, agent: proposal.agent, key: proposal.key });
    const state = readState(workspace);
    state.processed = [...new Set([...state.processed, ...noteIds])];
    writeState(workspace, state);
    console.log(JSON.stringify({ proposed: true, id: proposal.id }, null, 2));
  });
});
