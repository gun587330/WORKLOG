# WORK LOG Frontend (web/) — CLAUDE.md

모든 응답 · 문서 · 커밋 메시지는 **한국어**로 한다. 백엔드 규칙은 루트 `CLAUDE.md`, 데이터의 뜻은 `docs/VOCAB.md`.

## 절대 규칙 (Non-negotiable)

1. **dev 서버는 임의로 띄우지 않는다.** 필요하면 먼저 떠 있는지 확인(`pgrep -fl "next dev|next-server"`)하고, 띄워야만 하면 **하나만**, 포트 **3001**(anserx-code 가 3000 을 쓴다). "Port in use" 가 뜨면 즉시 중단하고 원인 확인. dev 서버가 떠 있는 동안 `npm run build` 금지 → 타입 검증은 `npm run typecheck`, 빌드 검증은 `npm run build:check`(distDir 분리).
2. **클라이언트 상태를 인가 근거로 쓰지 않는다.** 방어선은 서버 layout + RLS.
3. **페이지 UI 를 수정하기 전, 그 페이지 폴더의 `<이름>-SPEC.md` 를 읽는다.** 명세와 어긋나는 수정은 금지. 결정을 바꾸면 같은 작업에서 SPEC(결정 로그 포함)을 갱신한다. SPEC 없는 페이지를 만들 때는 SPEC 부터.
4. **상위 문서와의 정합**: `docs/frontend/DESIGN.md` · `I18N.md` · `docs/VOCAB.md` 와 어긋나는 변경이면 그 문서를 같은 작업에서 고친다.
5. **원문 md 는 보존하고, 파서(`lib/work-log.ts` · `lib/work-plan.ts`)는 양식만 안다.** 양식을 바꾸면 같은 작업에서 프롬프트 시드 · 파서 · VOCAB · SPEC 을 함께 고친다.

## 구조 관례 (anserx-code 와 동일)

- UI 작업 전에 `docs/frontend/DESIGN.md` 를 읽는다.
- 버튼 스타일 원본은 `components/ui/button.module.css` 하나. 유리 버튼 금지(`npm run check:glass` 강제). 보조 액션은 `variant="secondary"`.
- 뒤로가기는 `components/common/back-link` 하나.
- 공용 컴포넌트 확장은 opt-in prop 뒤에만. 기존 소비처 픽셀이 바뀌면 잘못된 확장이다.
- 디자인 토큰은 `styles/theme.css` 변수만. 색 하드코딩 금지(예외: 타임라인 마커 SVG, DESIGN §1 주석).
- 치수는 rem 만. `1px` 헤어라인과 `@media` 만 px.
- 추가 · 수정은 모달 폼, 삭제는 확인 모달. 박스 안 설명문은 박스 푸터(`.cfoot`)에.

## 문안 규칙

- 긴 대시(`—` · `–`) 금지. 두 문장으로 끊거나 쉼표 · 괄호 · 가운뎃점(`·`).
- 서버 · RPC 오류 원문을 화면에 띄우지 않는다. 알려진 실패는 i18n 키, 모르는 실패는 "잠시 뒤 다시 시도" 계열.
- 두 문장 이상인 안내는 `\n` 으로 줄을 나눈다. 제목 · 버튼 · 토스트 제목은 한 줄.
- 빈 값 플레이스홀더는 `·`.

## 데이터

- 전부 RPC(`lib/api/worklog.ts`) → TanStack Query 훅(`hooks/use-worklog.ts`). 테이블 직접 조회 없음.
- 업로드 흐름: 입력(파일 · 붙여넣기) → 파서 검수(모르는 코드 · 양식 위반을 문제로) → 게시(RPC 한 번) → 상세로 이동.
