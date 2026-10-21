# WORK LOG 백엔드 — 스키마 (SCHEMA)

> 개체의 뜻은 `docs/VOCAB.md` 가 정하고, 이 문서는 **테이블 · 마이그레이션 순서 · 결정 로그**를 적는다. (최종 수정: 2026-10-21)

## 1. 테이블

| 테이블 | 코드 | 비고 |
|---|---|---|
| `projects` | `P-<SLUG>` | 분류 축. 시드 10개(0003) |
| `goals` | `G<n>` | `code` 는 시퀀스 `goal_code_seq` 로 발급. 재사용 없음 |
| `plans` | `PL-…` | `raw_md` 보존 |
| `plan_items` | `G<n>-<m>` | `(goal_id, seq)` 유일. `due_date` 선택 |
| `work_logs` | `L-<날짜>[-k]` | append-only. 같은 날짜 k 는 insert 시 계산 |
| `work_items` | `L-<날짜>#<n>` | `project_id` 필수, `goal_id` 선택 |
| `work_hours` | | `(log_id, hour)` 유일, hour 0~23, value ∈ {0,.25,.5,.75,1} |
| `log_todos` | | `plan_item_id` 선택 |
| `item_completions` | | `(plan_item_id)` 유일 → 한 항목은 한 번만 완료 |
| `prompts` | | 시드 2종(0006) |
| `links` | | `(from_type, from_id, to_type, to_id)` 유일 |

## 9. 마이그레이션 순서

| # | 파일 | 내용 |
|---|---|---|
| 0001 | `init_conventions` | pgcrypto · `private` 스키마 봉쇄 · `set_updated_at()` (anserx 0001 복제) |
| 0002 | `owner_guard` | `assert_owner()` |
| 0003 | `projects` | 테이블 + 시드 10개 + RPC(list · insert · update · archive) |
| 0004 | `goals_plans` | `goals` · `goal_code_seq` · `plans` · `plan_items` + RPC |
| 0005 | `work_logs` | `work_logs` · `work_items` · `work_hours` · `log_todos` · `item_completions` + RPC(insert_work_log 가 한 트랜잭션으로 전부 적재) |
| 0006 | `prompts` | 테이블 + RPC + 시드(기록용 · 계획용) |
| 0007 | `links_context` | `links` + `context_pack(p_from, p_to)` + 홈 집계 RPC(`home_stats`) |
| 0008 | `prompts_project_confirm` | 프롬프트 2종 본문 개정: 프로젝트(분류)는 사용자 확인 뒤에만 적는다(루트 CLAUDE.md 절대규칙 10) |
| 0009 | `home_stats_week_projects` | 홈 「이번 주 투입」 프로젝트별 합이 총투입을 넘던 중복 합산 수정 |
| 0010 | `todos_standalone` | `log_todos.log_id` 선택화 + `project_id` · `goal_id` · `due_date` · `note` + `upsert_todo` · `delete_todo`, `home_stats` · `context_pack` 재정의 |

## 10. 결정 로그

| 결정 | 근거 |
|---|---|
| admin · role 을 두지 않는다 | 소유자 1명. 가입 OFF 라 로그인 = 소유자. 판정 함수 하나(`assert_owner`)로 충분하고, 여럿이 되면 `owner_id` 로 확장한다 |
| 기록은 유일 조건 없이 쌓는다 | anserx 0067→0068 의 교훈. 덮어쓰기는 기록 유실을 만든다 |
| 계획 항목 완료 경로를 "기록 md 의 `## 목표 진행`" 하나로 | 제목 매칭은 AI 가 문장을 바꾸면 깨진다. 코드 참조만 인정한다(VOCAB §2) |
| 목표 코드는 시퀀스, 삭제해도 재사용 안 함 | 과거 기록이 `G12` 를 가리키는데 다른 목표가 그 코드를 얻으면 뇌가 망가진다 |
| 서버 파서 없음 | 클라이언트 파서 한 벌이 검수 화면과 적재 둘 다 맡는다. 두 벌이면 어긋난다 |
| `links` 를 1차부터 저장 | 3차 UI 때 과거 기록을 다시 파싱하지 않기 위해. 저장은 싸다 |

- 2026-10-21 (0010) 「앞으로 할 일」을 화면에서 직접 추가 · 수정 · 삭제하게 했다. 새 표를 만들지 않고 `log_todos.log_id` 를 선택으로 풀어 한 표에 둔 이유: 홈 목록 · 컨텍스트 팩 · 체크 RPC 가 이미 이 표를 보고 있어서, 표를 나누면 세 곳이 두 표를 합쳐야 한다. 기록에서 온 할 일을 폼으로 고쳐도 `raw_md` 는 건드리지 않는다(절대규칙 8).

