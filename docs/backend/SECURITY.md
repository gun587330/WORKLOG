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

## MCP (클로드 연결, 2026-10-22 · 0012)

- **토큰**: `wl_` + 32바이트 난수. DB 에는 sha256 해시만 저장(`private.mcp_tokens`). 발급 · 폐기는 `npm run mcp:token`(service_role, 로컬)으로만.
  잃어버리거나 새어 나갔다고 의심되면 `npm run mcp:token -- --revoke-all` 후 다시 발급한다.
- **서버 키**: `/api/mcp` 는 anon 키만 쓴다. anon 이 부를 수 있는 함수는 `mcp_read` · `mcp_prepare` · `mcp_commit` 셋이고, 셋 다 첫 줄에서 토큰을 검사한다.
  토큰이 없거나 틀리면 42501 → HTTP 401. 나머지 RPC 는 여전히 anon 에 닫혀 있다.
- **쓰기**: 두 단계(preview → commit), 확인 번호 15분 · 1회 · 같은 도구 · 같은 토큰, 사용자 답변 원문 필수, 항목마다 분류 확인, 새 프로젝트는 기존 전부 검토 +
  이름 중복 차단, 삭제 도구 없음, 전부 `mcp_audit` 기록(VOCAB §7).
- **한계**: 서버는 사용자가 정말 승인했는지 볼 수 없고, 클로드가 절차를 밟았는지만 강제한다. 클로드 앱의 도구 승인 설정을 쓰기 도구는 "항상 묻기" 로 둔다.
- **경로 토큰**: claude.ai 커넥터는 헤더를 넣을 수 없어 `/api/mcp/<토큰>` 도 받는다. 주소 자체가 비밀이 되므로 남에게 보이는 곳에 붙여 넣지 않는다.
  Claude Code 는 헤더 방식을 쓴다.

