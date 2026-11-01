# 정리 규칙 (review-rules)

총괄이 저녁·주간 정리에서 `collect.mjs` 출력을 보고 수정안을 쓸 때 따른다.

## 1. 어떤 묶음을, 몇 건

- `eligible: true` 인 묶음만. 낡아서 닫혔거나 7일 만료된 제안의 메모도 다시 묶음으로 나온다. 예전 제안 문장을 그대로 다시 쓰지 말고 대상 파일을 지금 읽고 새로 맞춘다.
- 거절된 묶음은 2주 동안 `eligible: false`(`reason: cooldown`)로 나온다. 다시 제안하지 않는다. collect 가 이미 우선순위대로 정렬했다(교정 → 실패·더 나은 방법 → 대표님 성향 → 반복 작업).
- 하루 `slots` 건까지만(최대 3). 25줄 넘은 구역 합치기가 있으면 그게 먼저 1건.
- 같은 날 같은 파일에 갈 묶음이 2개면 한 건으로 합칠 수 있다(`replace` 로 두 줄을 함께 넣거나, `append` 한 줄에 담을 수 있으면 한 줄로). 합친 묶음의 `noteIds` 는 모두 넣는다. 열쇠(`key`)는 대표 하나.
- 묶음의 `agents` 가 여럿이면 가장 많이 메모한 에이전트(목록 첫 번째)의 파일로 제안한다. `reason` 에 "팀원 둘이 함께 겪었어요"처럼 적는다.

## 2. 묶음 → 수정안 종류

| 묶음 | 수정안 |
|---|---|
| `correction`·`failure`·`better_way` + target 규칙 파일 | `append` (그 파일 성장 노트 칸에 한 줄). 칸에 이미 비슷한 규칙이 있으면 그 줄을 `replace` 로 고친다 |
| target `skill:<이름>` | 그 에이전트의 `skills/<이름>/SKILL.md` 를 읽고 고칠 문장을 찾아 `replace`. 고칠 문장이 없으면 알맞은 문단의 끝 문장을 `old` 로 잡고 `new` 를 "그 문장 + 새 문장"으로 |
| `user_trait` | USER.md `append`. `line` 은 "~하신다" 관찰형("보고서를 받으면 숫자 근거부터 확인하신다"). 반영 때 "(추정)"이 자동으로 붙는다 |
| `repeat_task` | `new_skill` ([new-skill-template.md](new-skill-template.md)) |
| 스킬 파일이 그 에이전트 작업 폴더에 없음 | 제안하지 않는다(거부된다). 그 스킬이 공용 위치에 설치돼 있으면 고칠 수 없는 대상이다 |

- `line`·`reason`·`summary` 는 200자 이하 한 문장. `old`·`new` 는 4000자 이하.
- `reason` 은 대표님 눈높이 한 문장: "오늘 한 번 고쳐 주셨어요", "이번 주 두 번 같은 오류가 났어요", "세 번째 같은 요청이에요". 열쇠·파일 이름을 쓰지 않는다.
- 규칙 문장은 명령형 현재형("보고는 3줄 요약부터 시작한다."). 날짜는 넣지 않는다(반영 때 자동으로 "(날짜 승인)"이 붙는다).

## 3. 칸 합치기 (구역 25줄 이상, 또는 주간 정리)

- 대상 파일을 읽고 `<!-- self-improve:start -->` 와 `<!-- self-improve:end -->` **사이**의 제목 줄 다음부터 마지막 규칙 줄까지를 그대로 `old` 로 복사한다. **표시 줄 자체는 `old` 에 넣지 않는다.**
- `new` 는 중복을 합치고, 서로 부딪치는 규칙은 더 최근에 승인된 쪽을 남긴 규칙 줄들. 줄마다 `- ` 로 시작하고, 합친 줄 끝에는 가장 최근 승인 날짜 표시를 남긴다.
- `kind` 는 `correction`, `key` 는 `merge-<파일이름 소문자>`(예: `merge-agents-md`). 칸이 가득 차서 닫혔다가 collect 에 다시 나온 묶음(같은 파일 대상)이 있으면 합치기 `new` 에 그 규칙도 함께 넣고, 그 묶음의 `key`·`noteIds` 를 쓴다(한 건으로 처리).
- `reason` 예: "규칙이 많아져서 비슷한 것끼리 합쳤어요(28줄 → 17줄)".

## 4. 임시 JSON 형식

공통: `type`, `agent`(팀 명단의 id), `key`, `kind`, `reason`, `noteIds`(collect 묶음의 `noteIds` 그대로).

```json
{"type":"append","agent":"researcher","key":"report-3line-summary","kind":"correction",
 "file":"AGENTS.md","line":"보고는 3줄 요약부터 시작한다.",
 "reason":"오늘 한 번 고쳐 주셨어요","noteIds":["n-20261102-25ee09"]}
```

```json
{"type":"replace","agent":"researcher","key":"news-3-links","kind":"correction",
 "file":"skills/news-summary/SKILL.md","old":"기사 5건을 요약한다.","new":"기사 3건을 요약하고 출처 링크를 붙인다.",
 "reason":"이번 주 두 번 고쳐 주셨어요","noteIds":["n-…","n-…"]}
```

```json
{"type":"new_skill","agent":"researcher","key":"weekly-sales-sheet","kind":"repeat_task",
 "skillName":"weekly-sales-sheet","summary":"주간 매출 정리 — 절차 5단계, 담당 리서처",
 "skillMd":"---\nname: weekly-sales-sheet\ndescription: \"(시험판) …\"\n---\n\n# 주간 매출 정리\n…",
 "reason":"세 번째 같은 요청이에요","noteIds":["n-…","n-…","n-…"]}
```

- `file` 은 그 에이전트 작업 폴더 기준 상대경로: `AGENTS.md`·`TOOLS.md`·`SOUL.md`·`USER.md`·`skills/<이름>/SKILL.md`·`skills/<이름>/references/<…>.md` 만 허용.
- `append` 는 규칙 파일에만. 스킬 파일은 `replace` 로만.
- `skillMd`·`new` 에 비밀처럼 보이는 내용이 있으면 등록이 거부된다. 빼고 다시 쓴다.

## 5. 하지 않는 것

- 메모에 없는 교훈을 지어내지 않는다. 묶음의 `lessons`·`evidence` 범위 안에서만 쓴다.
- 수강생이 쓴 문장(성장 노트 칸 밖)을 고치는 `replace` 는 메모가 그 문장을 분명히 가리킬 때만. 애매하면 `append` 로.
- HIA 구역·다른 스킬의 행동 구역(`<!-- …:start -->` 로 감싼 부분)은 고치지 않는다.
- self-improve 스킬 자신은 고치지 않는다.
