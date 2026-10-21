# WORK LOG

정건 개인의 하루 작업 기록 · 계획 · 목표를 한곳에 모으는 사이트. anserx-code 운영자 콘솔의 「작업 공유」를
스택 · 규칙 · 테마 체계까지 그대로 옮기고 색만 블랙으로 바꿨다. 계획서: `../DESIGN/personal-worklog/PLAN.md`.

## 구조

```
worklog/
├─ supabase/        마이그레이션(SQL) — 스키마의 단일 원본
├─ scripts/         create-owner.mjs — 본인 계정 생성(service_role, 로컬 전용)
├─ docs/            VOCAB.md(데이터 어휘집) · frontend/ · backend/
└─ web/             Next.js 15 App Router + Supabase + next-intl(ko)
```

## 세팅 (처음 한 번)

1. Supabase 대시보드에서 새 프로젝트 생성 → Settings > API 에서 URL · anon · service_role 복사.
2. 루트 `.env` 를 `.env.example` 대로, `web/.env.local` 을 `web/.env.local.example` 대로 작성.
3. `supabase login` 상태에서 `supabase link --project-ref <ref> -p ''` → `npm run db:push -- -p ''` → `npm run gen:types`.
   DB 비밀번호는 필요 없다. CLI 가 관리 API 로 임시 로그인 역할을 만들어 연결한다(2026-10-21 확인).
4. `npm run owner:create` 로 본인 계정 생성.
5. `cd web && npm install && npm run dev` (포트 3001). anserx-code 가 3000 을 쓰므로 서버를 내릴 때는 `lsof -nP -iTCP:3001 -sTCP:LISTEN` 으로 PID 를 확인해 그것만 끝낸다.

## 배포

Vercel 프로젝트의 Root Directory 를 `web` 으로 두고 환경 변수에 `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` 두 개만 넣는다. service_role 키는 어디에도 올리지 않는다.
배포 뒤 Supabase 대시보드 Authentication > URL Configuration 의 Site URL 과 Redirect URLs 에 배포 주소를 추가한다.

## 규칙

- 루트 `CLAUDE.md`(백엔드) · `web/CLAUDE.md`(프론트)가 작업 규칙의 단일 원본이다. 작업 전에 읽는다.
- 데이터의 뜻은 `docs/VOCAB.md` 가 정한다. 프롬프트 · 화면 · MCP 가 같은 글을 쓴다.

## 클로드 연결 (MCP)

사이트의 `/api/mcp` 가 MCP 서버다. 클로드가 WORK LOG 를 읽고(계획 · 목표 · 기록 · 할 일 · 컨텍스트 팩), 사용자 승인을 받아 쓴다(VOCAB §7).

1. 토큰 발급: 루트에서 `npm run mcp:token -- --label claude-code`. 토큰은 한 번만 보인다.
2. 연결
   - Claude Code: `claude mcp add --transport http worklog https://worklog-phi-two.vercel.app/api/mcp --header "Authorization: Bearer <토큰>"` → `/mcp` 로 연결 확인.
   - claude.ai: 설정 > 커넥터 > 사용자 지정 커넥터 추가, URL 에 `https://worklog-phi-two.vercel.app/api/mcp/<토큰>`.
3. 클로드 앱의 도구 승인 설정에서 쓰기 도구(upload_log · upload_plan · create_project · save_goal · save_todo · set_todo_done · set_plan_item_status)는 "항상 묻기".
4. 폐기: `npm run mcp:token -- --revoke --label claude-code` 또는 `--revoke-all`.

