# WORK LOG — 보안 (SECURITY)

> anserx-code `docs/SECURITY.md` 중 이 사이트에 해당하는 것만. (최종 수정: 2026-10-21)

## 1. 경계

- **진짜 방어선 = RLS deny-all + `assert_owner()` RPC.** 미들웨어의 `/login` 리다이렉트와 `(app)/layout` 의 `getUser()` 확인은 UX 장치다.
- 공개 가입 OFF(`config.toml [auth] enable_signup = false`, 검증 필요). 계정은 `scripts/create-owner.mjs`(service_role) 로만.
- 세션은 `@supabase/ssr` 쿠키. 서버는 `getUser()`(서명 검증)로 판정하고 `getSession()` 으로 판정하지 않는다.

## 2. 키

- `NEXT_PUBLIC_SUPABASE_ANON_KEY` 만 브라우저에 간다. anon 으로는 모든 표가 0건이어야 한다.
- `SUPABASE_SERVICE_ROLE_KEY` 는 루트 `.env` 와 스크립트에만. 커밋 금지(`.gitignore`).

## 3. 점검 쿼리 (배포 전)

anon 키로 PostgREST 에 각 테이블을 조회해 전부 0건 · 또는 permission denied 인지 확인한다.
`select * from work_logs` 류의 직접 조회가 되면 정책이 열린 것이다.

## 4. MCP(2차) 를 열 때

- 개인 토큰(긴 무작위 문자열)을 `private.api_tokens` 에 해시로 저장하고, 라우트 핸들러가 검증한 뒤 service_role 로 RPC 를 부른다. 토큰은 화면에서 한 번만 보여 준다.
