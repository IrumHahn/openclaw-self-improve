---
name: self-improve
description: "성장 노트. 일하다 대표님이 방식을 고쳐 주거나, 명령이 실패해 원인을 알았거나, 더 나은 방법을 찾았거나, 같은 일을 반복했거나, 대표님이 바라는 기능을 말했을 때 교훈 한 줄을 메모한다. 총괄은 매일 22:00 팀 메모를 모아 규칙 파일(AGENTS/TOOLS/SOUL/USER.md)·스킬 수정안과 새 스킬 초안을 대화창에 번호로 제안하고, 대표님이 '1 승인'·'2 거절'·'전부 승인'·'1 나중에'·'1 되돌려'·'방금 거 되돌려'·'2 보여 줘'·'3 맞아'라고 답하면 처리한다. Use when corrected, after a failure or workaround, on a repeated task, when the owner says 방금 그거 기억해, on 성장 노트·배운 점·이번 주 뭐 배웠어·성장 노트 시작해 줘·성장 노트 꺼 줘·저녁 정리 지금 해 줘·알림이 안 와요, or on those numbered replies. Never edit rule files or skills directly — only through this skill's scripts after approval."
---

# 성장 노트 (self-improve)

이 스킬은 **비서 팀이 같은 실수를 두 번 하지 않게** 한다. 일하는 동안 배운 점을 한 줄씩 메모하고(모든 에이전트), 총괄이 저녁에 모아 고칠 점을 번호로 제안하고, 대표님이 승인한 것만 반영한다.

```
일하다 배움 ─▶ 메모 1줄 (각자)  ─▶ 22:00 저녁 정리 (총괄) ─▶ 🌱 번호 제안 ─▶ 대표님 답장
                                                                        ├ 승인 → 반영 (백업·장부)
                                                                        ├ 거절 → 2주간 다시 안 냄
                                                                        └ 되돌려 → 원래대로
```

대표님에게는 대표님의 언어(한국어 수강생이면 한국어)로, 쉬운 말로 말한다. **부를 때는 USER.md·IDENTITY.md 등에 대표님이 정해 둔 호칭이 있으면 그 호칭을, 없으면 "대표님"을 쓴다.** "주인"이라고 부르지 않는다. **대표님에게 파일 경로·id·sha·JSON·영어 오류문을 보여 주지 않는다.**

## 0. 먼저 알아둘 것 (에이전트용)

- 모든 명령은 `node <skill-dir>/scripts/<이름>.mjs`. `<skill-dir>` 는 이 SKILL.md 가 있는 폴더.
- `<workspace>` 는 **내** 작업 폴더 절대경로. `<main>` 은 **총괄** 작업 폴더 절대경로. 정리·승인 명령(collect·propose·apply·reject·rollback·maintain·status)은 총괄만 `--workspace <main>` 으로 실행한다.
- 팀 명단은 스크립트가 `openclaw agents list --json` 으로 읽는다. 그게 안 되는 환경이면 collect·propose·maintain·status 에 `--team <팀 명단 JSON 절대경로>` 를 붙인다(`[{"id":"main","workspace":"/절대/경로"}, …]`).
- **규칙 파일(AGENTS.md·TOOLS.md·SOUL.md·USER.md)과 스킬은 직접 고치지 않는다.** 반영은 `apply.mjs` 만 한다. 대표님이 "이거 규칙에 넣어 줘"라고 해도 메모 → 제안 → 승인 순서를 지킨다(바로 원하면 5-1 참고).
- 이 스킬(self-improve) 자신의 파일은 고치자고 제안하지 않는다.
- 메모·제안에 비밀번호·토큰·계좌·카드번호·주민번호·고객 실명·연락처를 넣지 않는다. 스크립트가 일부를 `[가림]` 으로 가리지만 믿지 않는다.
- 하지 않은 반영을 했다고 말하지 않는다. 결과는 스크립트 출력의 `message` 를 그대로 전한다.
- 스크립트가 0이 아닌 값으로 끝나면 7절 표대로 대표님에게 말한다. 표에 없는 오류는 "성장 노트 정리 중에 문제가 생겨서 이번 건은 처리하지 못했어요" 한 줄로 말하고, 오류문은 내 작업 기록에만 남긴다.

## 1. 메모하기 (모든 에이전트, 그 자리에서)

자세한 기준은 [`references/capture-rules.md`](references/capture-rules.md).

| 이럴 때 | kind |
|---|---|
| 대표님이 내 방식을 고쳐 줬다 ("길어, 요약 먼저") | `correction` |
| 명령·도구가 실패했고 원인을 알았다 | `failure` |
| 시행착오 끝에 되는 길을 찾았다 | `better_way` |
| 대표님이 "이런 것도 해 줘"라고 했다 (지금 못 하는 것) | `wish` |
| 같은 종류의 일을 또 했다 (매주 매출 정리 등) | `repeat_task` |
| 말하지 않았지만 대표님의 방식이 또 보였다 | `user_trait` |

1) 먼저 내 열쇠 목록을 본다. 같은 교훈의 열쇠가 있으면 그 열쇠를 그대로 쓴다.
```bash
node <skill-dir>/scripts/note.mjs --workspace <workspace> --list-keys
```
2) 한 줄 기록한다.
```bash
node <skill-dir>/scripts/note.mjs --workspace <workspace> --agent <내 id> --kind <kind> --key <key> \
  --lesson "<다음엔 이렇게 한다, 한 문장>" --target <AGENTS.md|TOOLS.md|SOUL.md|USER.md|skill:<스킬이름>|new-skill> \
  --evidence "<짧은 근거>"
```
- 출력의 `redacted: true` 는 비밀처럼 보이는 부분이 가려졌다는 뜻이다. 다음부터 그런 내용을 넣지 않는다.
- **메모했다고 대표님에게 매번 알리지 않는다.** 교정을 받았을 때만 "기억해 둘게요" 한마디.
- 일을 마치는 게 먼저다. 메모는 일하는 흐름을 끊지 않게 짧게.

## 2. 저녁 정리 (총괄, 월~토 22:00 크론)

대표님이 "성장 노트 저녁 정리 지금 해 줘"라고 하면 시각과 상관없이 지금 한다.

판단 기준은 [`references/review-rules.md`](references/review-rules.md).

1) 오래된 것 정리 (7일 지난 대기 제안 만료, 30일 지난 메모·백업 보관). 만료된 제안의 메모는 다시 모으기 대상으로 풀려서 2)에서 다시 나온다:
```bash
node <skill-dir>/scripts/maintain.mjs --workspace <main>
```
2) 팀 메모 모으기:
```bash
node <skill-dir>/scripts/collect.mjs --workspace <main>
```
   - 낡아서 닫혔거나(stale) 7일 만료된 제안의 메모도 여기 다시 나온다. 새 묶음과 똑같이, 대상 파일을 **지금** 읽고 다시 쓴다. 거절된 것은 2주 동안 나오지 않는다.
   - `groups` 중 `eligible: true` 만 본다. 순서대로 위에서부터 **`slots` 개수까지만** 제안한다(하루 3건). 남은 것은 내일로.
   - `sections` 에 `lines` 가 25 이상인 구역이 있으면 **그 구역 합치기 제안을 먼저 1건** 한다(review-rules 3절).
   - `missing`(작업 폴더를 못 찾은 팀원), `skipped`(깨진 메모 줄), `brokenPending`(깨진 제안 파일), `sections` 의 `error`(구역 끝 표시가 지워짐)는 6)에서 대표님에게 쉬운 말로 알린다.
3) 묶음마다 `append` / `replace` / `new_skill` 중 하나를 정해 임시 JSON 파일(예: `<main>/learnings/draft-proposal.json`)에 쓰고 등록한다:
```bash
node <skill-dir>/scripts/propose.mjs --workspace <main> --file <임시 JSON 절대경로>
```
   - `replace` 의 `old` 는 대상 파일을 **지금 읽어서 그대로 복사한** 문장이다. 파일에 정확히 한 번만 있어야 한다. 구역 표시 줄(`<!-- self-improve… -->`)을 지우거나 늘리는 수정은 거부된다.
   - 대상 스킬 파일은 그 에이전트 작업 폴더의 `skills/<스킬이름>/SKILL.md`(또는 그 안 `references/*.md`).
   - `new_skill` 의 `skillMd` 는 [`references/new-skill-template.md`](references/new-skill-template.md) 양식, description 에 `(시험판)` 필수.
   - propose 가 실패하면 7절 표대로 처리한다(대표님에게는 알리지 않는다).
4) 등록이 끝나면 메시지를 만든다:
```bash
node <skill-dir>/scripts/status.mjs --workspace <main> --message
```
   - 이 메시지에는 오늘 새 제안과 아직 답이 없는 지난 제안(최대 7일)이 함께 들어가고 번호가 새로 매겨진다. 하루 3건 제한은 새 제안에만 적용된다.
5) 출력이 있으면 **그대로** 대표님에게 보낸다(6의 한 줄 말고는 내 말을 앞뒤에 붙이지 않는다). **출력이 비어 있으면 아무것도 보내지 않는다.**
6) 2)의 문제는 보낼 메시지가 있을 때 맨 끝에 한 줄로 붙인다. 보낼 메시지가 없으면 일요일 주간 리포트 끝에 붙인다. 말하는 법:
   - `missing` → "팀원 '리서처'의 작업 폴더를 찾지 못해서 오늘은 그 팀원의 메모를 보지 못했어요."
   - `skipped` → "'리서처'의 메모 중 몇 줄이 깨져 있어서 건너뛰었어요. 나머지는 정상이에요."
   - `brokenPending` → "지난 제안 중 하나가 깨져서 열 수 없었어요. 같은 일이 또 생기면 다시 제안할게요."
   - `sections` 의 `error` → "'리서처'의 업무 규칙 파일에서 성장 노트 칸의 끝 표시가 지워져 있어서 그 파일엔 새 규칙을 넣지 못해요. 원하시면 고치는 방법을 알려 드릴게요." (대표님이 원하면 그 파일의 성장 노트 칸 마지막 규칙 줄 다음에 `<!-- self-improve:end -->` 한 줄을 넣으면 된다고 알려 준다. 내가 고치지 않는다.)

## 3. 대표님의 답 처리 (총괄)

번호는 **마지막으로 보낸 🌱 메시지** 기준이다. 오늘 보낸 메시지가 아니면(`<main>/learnings/state.json` 의 `lastMessage.at` 날짜 확인) 승인·되돌리기 전에 `status.mjs --show <번호>` 로 내용을 보고 "'보고는 3줄 요약부터 시작한다' — 이거 맞죠?" 처럼 한 번 확인받는다.

| 대표님 말 | 명령 | 대표님에게 |
|---|---|---|
| "1 승인" · 추정 항목에 "1 맞아" | `node <skill-dir>/scripts/apply.mjs --workspace <main> --number 1` | 출력 `message` 그대로 |
| "전부 승인" | `node <skill-dir>/scripts/apply.mjs --workspace <main> --all` | "N건 반영했어요." + 실패한 번호는 7절 표대로 한 줄씩 |
| "2 거절" | `node <skill-dir>/scripts/reject.mjs --workspace <main> --number 2` | 출력 `message` 그대로 |
| "1 나중에" | 아무것도 실행하지 않는다 | "알겠어요. 내일 밤 메시지에 다시 함께 넣을게요(최대 7일). 그때까지 답이 없으면 닫고, 새로 다듬어서 다시 여쭤볼게요." |
| "2 보여 줘" | `node <skill-dir>/scripts/status.mjs --workspace <main> --show 2` | 출력 그대로 |
| "1 되돌려" | `node <skill-dir>/scripts/rollback.mjs --workspace <main> --number 1` | 출력 `message` 그대로 |
| "방금 거 되돌려" | `node <skill-dir>/scripts/rollback.mjs --workspace <main> --last` | 출력 `message` 그대로 |

- `--all` 출력은 `results` 목록이다. `ok: false` 인 항목은 `error` 문장으로 7절 표의 경우를 찾아 말한다. `apply.mjs` 는 하나라도 실패하면 1로 끝나지만 나머지는 반영된 상태다.
- 번호가 여러 개면("1, 3 승인") 하나씩 실행한다.
- 대표님이 번호 없이 "그거 되돌려"라고 하면 무엇인지 확인하고, 방금 반영한 것이 맞으면 `--last`.
- 예전에 반영한 규칙을 내용으로 말하면("숫자 열 규칙 빼 줘") `<main>/learnings/pending/` 의 제안 파일들을 읽어(읽기만) `status: "applied"` 이고 `line`·`new`·`skillName` 이 맞는 것을 찾고, 그 문장을 보여 주며 확인받은 뒤 `rollback.mjs --workspace <main> --id <그 제안의 id>`.

**되돌리기 충돌 (rollback 이 2로 끝남):** 반영한 뒤에 그 파일이 또 바뀌었다는 뜻이다. 출력 JSON 의 `addedSinceApply`(그 뒤 생긴 줄)·`removedSinceApply`(그 뒤 사라진 줄), 스킬이면 `addedFiles`·`removedFiles` 를 쉬운 말로 최대 5줄 보여 준다:
> 반영한 뒤에 이 파일이 또 바뀌었어요.
> 그 뒤에 생긴 내용: "…"
> 되돌리면 이 내용도 함께 사라져요. (스킬이면: 함께 보관함으로 옮겨져요.) 그래도 되돌릴까요?

대표님이 **"응/되돌려"라고 분명히 답한 뒤에만** 같은 명령에 `--force` 를 붙여 다시 실행한다. 답이 없거나 망설이면 실행하지 않는다.

**새 스킬 승인 뒤:** apply 가 담당 에이전트 작업 폴더의 `skills/<스킬이름>/SKILL.md` 를 만든다. 대표님에게:
> 새 스킬 초안 '<스킬이름>'을 만들어 뒀어요(시험판). 다음 대화부터 써 볼 수 있는지 확인해 볼게요.

- 설치 직후 인식 여부는 OpenClaw 버전에 따라 다를 수 있다. `openclaw skills list --help` 로 형태를 확인하고 담당 에이전트의 스킬 목록에 보이는지 본다. 보이면 "이제 써 볼 수 있어요. 한 번 써 보시고 고칠 점을 말해 주세요." 안 보이면 대표님에게 알리고, 대표님이 좋다고 하면 `openclaw skills install --help` 로 확인한 뒤 `openclaw skills install <그 스킬 폴더> --agent <담당 id>` 형태로 설치한다. 확인 전에는 "이제 바로 쓸 수 있어요"라고 말하지 않는다.
- 대표님이 "새 스킬 설치 확인해 줘"라고 하면 위 확인을 한다.
- 시험판을 쓰다가 고칠 점이 나오면 다시 1절 메모(`--target skill:<스킬이름>`)로.

## 4. 주간 정리 (총괄, 일요일 22:00 크론)

일요일은 2절 대신 아래 순서로 한다. 리포트 뒤에 그날 제안이 이어서 나갈 수 있다.
1) `node <skill-dir>/scripts/maintain.mjs --workspace <main>`
2) `node <skill-dir>/scripts/status.mjs --workspace <main> --weekly` → 출력을 그대로 대표님에게 보낸다. 이번 주 2-6)에서 미뤄 둔 문제가 있으면 끝에 한 줄씩 붙인다.
3) 이어서 2절 2)~5)를 한다. 이날은 `sections` 의 25줄 넘은 구역과 중복·충돌하는 규칙을 합치는 제안을 먼저 한다.

## 5. 처음 설치했을 때 · "성장 노트 시작해 줘" (총괄)

1) 대표님에게 저녁 정리 시각(기본 매일 밤 10시, 일요일은 주간 리포트)과 받을 채널을 확인받는다.
2) 등록 전에 설치된 버전의 `openclaw cron add --help` 로 형태를 확인한다. OpenClaw 2026.10.x 에서 확인된 형태(에이전트 잡, 텔레그램으로 대표님에게만 전달):
```bash
openclaw cron add --name self-improve-evening --agent main --cron "0 22 * * 1-6" --tz Asia/Seoul \
  --channel telegram --to <대표님 텔레그램 chatId> --announce \
  --message "self-improve 스킬 2절(성장 노트 저녁 정리)을 실행해. status --message 출력이 비어 있으면 아무것도 보내지 마."
openclaw cron add --name self-improve-weekly --agent main --cron "0 22 * * 0" --tz Asia/Seoul \
  --channel telegram --to <대표님 텔레그램 chatId> --announce \
  --message "self-improve 스킬 4절(성장 노트 주간 정리)을 실행해."
```
   - `--agent` 는 총괄 id(보통 `main`). `--channel last` 는 쓰지 않는다. 텔레그램과 디스코드가 둘 다 연결돼 있으면 등록이 거부된다. chatId 를 모르면 대표님께 텔레그램으로 말을 걸어 달라고 하고 확인한다.
3) `openclaw cron list` 로 두 개가 등록됐는지 확인하고, 대표님에게 **두 시각과 채널 이름**을 보여 준다.
4) 팀원 AGENTS.md 에 메모 규칙이 들어갔는지 모르면 대표님에게 설치 안내의 `install_hook.mjs --all-agents` 줄을 실행했는지 물어본다. 내가 AGENTS.md 를 직접 고치지 않는다.

### 5-1. 대표님이 "지금 바로 반영해 줘"라고 할 때
메모(1절)를 남긴 뒤 2절 2)~5)를 지금 돌려 그 건만 번호로 제안한다. 대표님이 번호로 승인하면 반영한다. 오늘 몫(`slots`)이 0이면 "오늘 제안 몫이 다 찼어요. 내일 저녁에 올릴게요."

### 5-2. "알림이 안 와요" / "성장 노트 꺼 줘"
- 알림 확인: `openclaw cron list` 에서 `self-improve-evening`·`self-improve-weekly` 가 있는지, 시각·채널이 맞는지 보고 쉬운 말로 알려 준다. 둘 다 있으면 "오늘은 제안할 만큼 쌓인 배운 점이 없어서 조용했던 거예요"일 수 있다 — `status.mjs --workspace <main>` 현황으로 확인해 말한다.
- 끄기: 대표님에게 "저녁 알림 두 개를 끌까요? 지금까지 쌓인 메모는 그대로 남아요." 확인받은 뒤, `openclaw cron --help` 로 지우는 명령을 확인해 그 두 개만 지운다. 다른 크론은 건드리지 않는다. 다시 켜려면 5절 2)~3).

## 6. "성장 노트 보여 줘" / "이번 주 뭐 배웠어?"

- "성장 노트 보여 줘" → `node <skill-dir>/scripts/status.mjs --workspace <main>` (현황) 출력 그대로.
- "이번 주 뭐 배웠어?" → `node <skill-dir>/scripts/status.mjs --workspace <main> --weekly` 출력 그대로. 원하면 한두 줄로 내 말로 덧붙여도 된다("이번 주엔 보고 방식을 제일 많이 배웠어요").
- 대시보드·위젯이 숫자를 가져갈 때는 `--json`.
- 팀원이 이 말을 들으면 총괄에게 물어보라고 안내한다(정리는 총괄 담당).

## 7. 끝난 값(exit code)별 처리

| 명령 | 값 | 뜻 | 할 일 / 대표님에게 |
|---|---|---|---|
| 모두 | 0 | 성공 | 출력 `message` 그대로 |
| 모두 | 5 | 다른 정리 작업이 진행 중 | 1분쯤 뒤 한 번만 다시 실행. 또 5면 "다른 정리를 하는 중이라 잠시 뒤에 다시 할게요." |
| apply | 4 | 제안 뒤 그 파일이 바뀌어 제안이 낡음. 제안은 닫혔고, 메모는 풀려서 내일 저녁 collect 에 다시 나온다 | "그 사이 파일이 바뀌어서 이 제안은 닫았어요. 내일 저녁에 새로 맞춰서 다시 여쭤볼게요." 지금 다시 제안하지 않는다. 대표님이 "지금 다시 만들어 줘"라고 하고 오늘 `slots` 가 남아 있을 때만 2절 2)~5)를 지금 돌린다 |
| apply | 3 | 성장 노트 칸이 가득 참(30줄). 제안은 닫혔고, 메모는 내일 저녁 collect 에 다시 나온다 | "규칙 칸이 가득 차서 이번 건은 넣지 못했어요. 내일 저녁에 비슷한 규칙을 합치면서 이번 규칙도 함께 넣는 제안으로 다시 여쭤볼게요." 내일 저녁 정리에서 그 칸 합치기(review-rules 3절)를 할 때 이 묶음을 함께 넣는다 |
| apply | 1 | "끝 표시가 없어요"(성장 노트 칸 끝 표시가 지워짐). 제안은 닫혔고 메모는 다시 나온다 | 2절 6)의 `sections` `error` 문장으로 말한다. 끝 표시가 되살아나기 전에는 그 파일에 다시 제안하지 않는다 |
| apply | 1 | "이미 처리된 제안" | "그 제안은 이미 처리됐어요." |
| apply·reject·rollback·show | 1 | "번호 N에 해당하는 제안이 없어요" | "N번 제안을 찾지 못했어요. 가장 최근 성장 노트 메시지의 번호로 말씀해 주세요." |
| apply | 1 | "같은 이름의 스킬이 이미 있어요" | "같은 이름의 스킬이 이미 있어서 새로 만들지 않았어요." |
| rollback | 2 | 반영 뒤 또 바뀜(충돌) | 3절 충돌 흐름. `--force` 는 대표님이 "예"라고 한 뒤에만 |
| rollback | 1 | "되돌릴 수 있는 상태가 아니에요" | 아직 반영 전이면 "그 제안은 아직 반영되지 않았어요. 거절하시려면 'N 거절'이라고 해 주세요." 이미 되돌렸으면 "이미 되돌렸어요." |
| rollback | 1 | "되돌릴 수 있는 반영 기록이 없어요" | "되돌릴 반영이 아직 없어요." |
| rollback | 1 | "되돌릴 원본을 찾을 수 없어요" | 그 문장 그대로 전하고, 원래대로 고치는 `replace` 제안을 다음 정리 때 한다 |
| propose | 3 | `daily cap`(오늘 3건 다 참) | 이번 저녁 등록을 멈춘다. 나머지는 내일. 대표님에게 말하지 않는다 |
| propose | 3 | `section full`(칸 30줄) | 그 파일 합치기 제안을 먼저 하고, 이 건은 내일 |
| propose | 3 | `cooldown`(2주 전 거절됨) | 건너뛴다 |
| propose | 1 | 그 밖(형식·비밀 포함·`already pending`·문장 0회/2회 일치 등) | 오류문대로 JSON 을 고쳐 한 번만 다시. 또 실패하면 그 묶음은 건너뛴다. 비밀이 들어갔다는 오류면 그 내용을 빼고 쓴다 |
| collect·maintain·status | 1 | 장부·상태 파일이 망가짐 등 | "성장 노트 기록장에 문제가 있어서 오늘 정리를 하지 못했어요. 고치는 걸 도와드릴까요?" 내가 기록장을 고치지 않는다 |
