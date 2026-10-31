# openclaw-self-improve — 성장 노트 스킬

OpenClaw 비서 팀이 **일하면서 배운 점을 메모하고, 다음에 같은 실수를 하지 않게** 하는 스킬이다. 최신 AI 에이전트의 핵심 기술인 학습 루프(일하며 배운 것을 규칙·스킬로 고쳐 쓰기)를 OpenClaw 팀 구조(총괄 `main` + 팀원)에 맞춰, **주인이 대화창에서 번호로 승인한 것만** 반영하도록 만들었다.

- 팀원·총괄 모두 교정·실패·더 나은 방법·반복 작업·바라는 기능·주인 성향(추정)을 그 자리에서 한 줄 메모한다.
- 총괄이 매일 22:00 팀 메모를 모아 규칙 파일(AGENTS.md·TOOLS.md·SOUL.md·USER.md)·설치된 스킬 수정안과 새 스킬 초안을 번호로 제안한다(새 제안은 하루 최대 3건, 답 없는 지난 제안은 7일까지 함께 다시 나감, 없으면 조용).
- 주인이 "1 승인" · "2 거절" · "전부 승인" · "1 나중에" · "1 되돌려" · "2 보여 줘"로 답한다. 일요일에는 이번 주 성장 리포트가 먼저 오고 그날 제안이 이어질 수 있다.

```
일하다 배움 ─▶ note.mjs 메모 1줄 (각자 작업 폴더)
                      │
             22:00 저녁 정리 (총괄)
   maintain.mjs ─▶ collect.mjs ─▶ propose.mjs ─▶ status.mjs --message
                                                      │
                                         🌱 번호 제안 ─▶ 주인 답장
                                                      ├ "1 승인"   → apply.mjs    (확인·백업·장부)
                                                      ├ "2 거절"   → reject.mjs   (2주간 다시 안 냄)
                                                      ├ "1 나중에" → 그대로 (7일 뒤 만료 → 다시 제안 대상)
                                                      └ "1 되돌려" → rollback.mjs (원래대로)
             일요일 22:00 주간 정리: maintain ─▶ status --weekly ─▶ (칸 합치기 등) 저녁 정리
```

## 구성

- `skill/self-improve/` — 스킬 본체. 이 폴더만 설치하면 된다.
  - `SKILL.md` 절차(메모 · 저녁 정리 · 답장 처리 · 주간 정리 · 처음 설치 · 보기 · 끝난 값별 처리)
  - `references/capture-rules.md` 메모 기준 · `references/review-rules.md` 정리·수정안 기준 · `references/new-skill-template.md` 새 스킬 초안 양식
  - `scripts/` — npm 의존성 없는 Node 22 스크립트: `note` · `collect` · `propose` · `apply` · `reject` · `rollback` · `maintain` · `status` (+ `lib/`)
- `scripts/install_hook.mjs` — 팀 전원의 `AGENTS.md`에 "일하면서 배운 점 메모하기" 구역을, 총괄에게는 "저녁 정리 담당" 문단을 더 넣는다(멱등·백업·`--remove`·`--dry-run`).
- `docs/quickstart-ko.md` — 수강생용 안내.
- `tests/` — `node:test` 테스트.

## 설치 (OpenClaw 2026.10 기준)

```bash
git clone https://github.com/IrumHahn/openclaw-self-improve.git
openclaw skills install ./openclaw-self-improve/skill/self-improve --as self-improve --agent main
openclaw skills install ./openclaw-self-improve/skill/self-improve --as self-improve --agent <팀원 id>   # 팀원마다 한 줄씩
node ./openclaw-self-improve/scripts/install_hook.mjs --all-agents
```

- 팀원 id 는 `openclaw agents list` 로 확인한다.
- `install_hook.mjs --all-agents` 는 `openclaw agents list --json` 의 작업 폴더마다 `AGENTS.md` 를 고친다. 원래 파일은 `AGENTS.md.bak-self-improve-<시각>` 으로 남는다. 먼저 `--dry-run` 으로 무엇이 바뀌는지 볼 수 있다. CLI 를 쓸 수 없으면 `--team <팀 명단 JSON>`(`[{"id":"main","workspace":"/절대/경로","isDefault":true}, …]`) 또는 총괄 하나만 `--workspace <dir>`.
- 마지막으로 총괄에게 **"성장 노트 시작해 줘"** 라고 말한다. 총괄이 시각·채널을 확인받고 크론 2개(`0 22 * * 1-6` 저녁 정리, `0 22 * * 0` 주간 정리, Asia/Seoul)를 `openclaw cron add` 로 등록한다(SKILL.md 5절).

## 제거

```bash
node ./openclaw-self-improve/scripts/install_hook.mjs --all-agents --remove
```

그다음 총괄에게 "성장 노트 꺼 줘"라고 해서 크론 2개를 지우고(또는 `openclaw cron list` 에서 `self-improve-evening`·`self-improve-weekly` 를 직접 삭제), 설치된 스킬 폴더를 지운다. 각 작업 폴더의 `learnings/` 와 규칙 파일 안의 성장 노트 칸은 남는다(반영된 규칙은 주인 것이므로 자동으로 지우지 않는다).

## 테스트

```bash
cd openclaw-self-improve
node --test tests/*.test.mjs
```

## 안전장치

1. **허용 파일만** — 각 작업 폴더의 `AGENTS.md`·`TOOLS.md`·`SOUL.md`·`USER.md`, `skills/<이름>/SKILL.md`, `skills/<이름>/references/**/*.md`. 그 밖의 파일, 작업 폴더 밖, 바로가기(심볼릭 링크)는 거부.
2. **승인한 것만** — 제안은 `learnings/pending/` 에 대기하고, 규칙 파일은 `apply.mjs` 만 고친다. 에이전트가 직접 고치지 않도록 SKILL.md·행동 구역에 명시.
3. **부분 수정** — 추가(`append`)는 표시된 성장 노트 칸 안에 한 줄. 바꿔치기(`replace`)는 고칠 문장이 파일에 정확히 한 번 있을 때만, 칸 표시를 지우거나 늘리는 수정은 거부.
4. **낡은 제안 거부** — `replace` 는 제안 때의 sha256 과 지금이 다르면 반영하지 않고 제안을 닫는다(exit 4). 칸이 30줄 차면 추가를 거부하고 닫는다(exit 3). 닫힌 제안의 메모는 다시 풀려서 다음 저녁 정리에서 지금 파일에 맞춰 새로 제안된다(칸이 찼으면 합치기와 함께).
5. **백업·장부** — 반영 전 원본을 `learnings/backups/<id>/` 에, 모든 제안·반영·거절·만료·되돌리기를 `learnings/ledger.jsonl` 에 남긴다. 쓰기는 임시 파일 → rename.
6. **되돌리기** — 반영 뒤 파일이 또 바뀌었으면 멈추고 차이를 보여 준다(exit 2). 주인이 확인한 뒤에만 `--force`. 30일 지나 보관된 백업으로도 되돌린다. 지우지 않고 `archive/` 로 옮긴다.
7. **비밀 가리기** — 메모·제안의 토큰·키 모양, 이메일, 전화·카드번호 모양을 `[가림]` 으로 바꾸고, 새 스킬 초안·바꿀 문장에 비밀 모양이 있으면 등록을 거부한다.
8. **과하지 않게** — 새 제안은 하루 최대 3건, 거절한 열쇠는 14일 쿨다운, 답 없는 제안은 7일 뒤 만료(메모는 다시 제안 대상으로 돌아감), 동시 실행 잠금(exit 5).

## 데이터 위치

```
<각 에이전트 작업 폴더>/learnings/
  notes.jsonl              메모 (추가만)
  archive/notes-YYYY-MM.jsonl   30일 지난 처리 끝 메모

<총괄 작업 폴더>/learnings/
  pending/<id>.json        제안 (상태: pending · applied · rejected · expired · stale · rolled_back)
  ledger.jsonl             장부 (추가만)
  backups/<id>/            반영 전 원본 · 반영 후 사본
  state.json               처리한 메모 id · 거절 쿨다운 · 마지막 메시지 번호표
  archive/                 30일 지난 백업 · 되돌린 스킬
```

규칙 파일 안의 성장 노트 칸(구역이 없으면 첫 반영 때 파일 끝에 생긴다):

```
<!-- self-improve:start -->
## 성장 노트 — 배운 규칙
- 보고는 3줄 요약부터 시작한다. (2026-11-02 승인)
<!-- self-improve:end -->
```

USER.md 는 `## 성장 노트 — 주인에 대해 (추정 포함)` 이고 주인 성향 규칙 앞에 `(추정)` 이 붙는다. `install_hook.mjs` 가 넣는 행동 구역(`<!-- self-improve-hook:start -->`)은 이 칸과 별개다.

## 새 스킬 인식

- 새 스킬을 승인하면 `<작업 폴더>/skills/<이름>/SKILL.md` 가 생긴다. 설치 직후 인식 여부는 OpenClaw 버전에 따라 다를 수 있다 — 안 보이면 `openclaw skills install <폴더> --agent <id>`. 수강생은 총괄에게 "새 스킬 설치 확인해 줘"라고 말하면 된다.

## 라이선스

코드·스킬 지침은 MIT([LICENSE](LICENSE)), 설명 문서는 CC BY 4.0([docs/LICENSE](docs/LICENSE)). 예제의 팀·이름은 가상이다. 구조는 Hermes Agent 학습 루프와 pskoett/self-improving-agent 의 `.learnings/` 구성을 참고했고, 코드와 문구는 새로 썼다.
