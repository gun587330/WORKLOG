# WORK LOG 백엔드 — 개발 규약 (CONVENTIONS)

> anserx-code `docs/backend/CONVENTIONS.md` 를 개인 1계정 사이트에 맞게 줄인 것. (최종 수정: 2026-10-21)

## 1. 스키마

| 스키마 | 역할 |
|---|---|
| `public` | 앱이 RPC 로 읽고 쓰는 테이블 전부 |
| `private` | 클라이언트가 절대 만지면 안 되는 것. PostgREST 에 노출하지 않는다(`config.toml [api] schemas` 미포함). 지금은 비어 있고 0001 이 봉쇄만 해 둔다 |

## 2. 네이밍

- 테이블 `snake_case` 복수형(`work_logs`, `plan_items`). 연결 테이블 `a_b`(`item_completions`).
- 컬럼 `snake_case`. 사람이 읽는 코드는 `code` 컬럼(VOCAB §4).
- 마이그레이션 파일: CLI 타임스탬프 + `_<논리 번호>_<설명>` (예: `..._0003_projects.sql`).

## 3. 공통 컬럼

```sql
id          uuid        primary key default gen_random_uuid(),
created_at  timestamptz not null default now(),
updated_at  timestamptz not null default now()   -- set_updated_at() 트리거 부착
```

## 4. 접근 통제

- 소유자 1명. `assert_owner()` = `auth.uid()` 가 있으면 통과, 없으면 42501. 가입이 꺼져 있어 로그인 가능한 계정은 소유자뿐이다.
- 테이블은 전부 RLS enable + 정책 0개(deny-all). 읽기 · 쓰기는 `security definer set search_path = ''` RPC 로만. `revoke execute … from public, anon` + `grant … to authenticated, service_role` 을 함수마다 붙인다.
- 여럿이 쓰게 되면 `owner_id` 컬럼 + `assert_owner()` 를 소유권 판정으로 바꾼다. 그때까지 컬럼을 미리 만들지 않는다.

## 5. 함수

- 이름: `list_*` · `get_*` · `insert_*` · `update_*` · `delete_*` · `context_pack`. 접두 `admin_` 은 쓰지 않는다(admin 개념 없음).
- 쓰기 RPC 는 입력 검증(빈 값 · 범위 · 코드 존재)을 함수 안에서 하고 사람이 읽는 메시지로 예외를 던진다. 화면은 그 원문을 그대로 띄우지 않는다(web/CLAUDE.md 문안 규칙).

## 6. 파서와 DB 의 역할

- md 원문은 `raw_md` 에 보존. 구조(작업 · 시간표 · 할 일 · 코드 참조 · 링크)는 **클라이언트 파서**(`web/src/lib/work-log.ts` · `work-plan.ts`)가 뽑아 RPC 인자로 보낸다. 서버 파서를 두지 않는다(두 벌이 어긋난다). 같은 원문을 다시 파싱하면 같은 구조가 나와야 한다.
- 코드 참조(`G12`, `G12-3`, `P-ANSERX`)는 RPC 가 존재 여부를 확인하고, 없는 코드는 거부한다.
