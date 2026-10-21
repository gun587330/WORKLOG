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
3. `supabase link --project-ref <ref>` → `npm run db:push` → `npm run gen:types`.
4. `npm run owner:create` 로 본인 계정 생성.
5. `cd web && npm install && npm run dev` (포트 3001).

## 규칙

- 루트 `CLAUDE.md`(백엔드) · `web/CLAUDE.md`(프론트)가 작업 규칙의 단일 원본이다. 작업 전에 읽는다.
- 데이터의 뜻은 `docs/VOCAB.md` 가 정한다. 프롬프트 · 화면 · MCP 가 같은 글을 쓴다.
