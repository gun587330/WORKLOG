# 개인 명세 (/me)

> 이 화면의 단일 명세서. 최종 수정: 2026-10-22 · 상태: **1차 구현 완료**
> 구현체: 이 폴더 `page.tsx` + `components/worklog/me-view.tsx` · `worklog.module.css`(`.meSplit` · `.diary*` · `.guide`) + `lib/guide.ts`(사용 방법 본문) + `lib/api/worklog.ts` · `hooks/use-worklog.ts`(일기 절)
> 서버: `diary_entries` + `list_diary` · `upsert_diary` · `delete_diary`(0015) · 어휘: `docs/VOCAB.md` 일기

## 1. 목적

개인 공간. 왼쪽에 **일기**를 쓰고 DB 에 남긴다. 오른쪽은 이 사이트와 클로드 연결(MCP)의 **사용 방법**이다.
나중에 일기와 작업 기록 · 계획을 함께 엮어 결과물(회고 · 주간 리포트 등)을 만드는 확장을 위해, 일기에도 코드(D-날짜)를 주고 본문의 `[[코드]]` 를 links 에 남긴다.

## 2. 레이아웃 (세로 100%)

좌우 비율은 **홈과 같다**: 좌 `minmax(0, 1fr)` · 우 `45rem`(홈 오른쪽 두 칸 22rem + 22rem + 간격 1rem). 좁은 화면은 한 줄.

- **좌 · 일기**: [일기 · N편 · 최근순 | 일기 쓰기(블랙 sm)] · 회색 면 카드 목록(날짜(요일) · 코드 · 제목 · 본문 3줄 · 태그 칩). 카드를 누르면 **같은 폼이 수정 모드로** 열린다. 푸터 2줄.
- **일기 폼**(lg 모달): 날짜(새로 쓸 때만, 기본 오늘) · 제목(선택) · 본문(마크다운, 남는 높이 전부) · 태그(쉼표). 수정 때 푸터 왼쪽 [삭제] → 확인 모달. 날짜는 코드가 날짜에서 나오므로 고칠 수 없다.
- **우 · 사용 방법**: `lib/guide.ts` 의 md 를 `WorkMarkdown` 으로 그린다(코드블록 · `:::` 토글). ① 사이트에서 하루 정리 ② 클로드 연결(토큰 발급 · Claude Code · claude.ai · 쓰기 도구 항상 묻기) ③ 클로드에게 말하는 예 ④ 클로드가 지키는 규칙 + 토글(토큰 재발급 · 일기 안내).

## 3. 데이터

| 훅 | RPC |
|---|---|
| `useDiary()` | `list_diary(p_from, p_to, p_limit)` |
| `useUpsertDiary()` | `upsert_diary(p_id, p_entry_date, p_title, p_body, p_tags, p_links)` — 본문 `[[코드]]` 를 파서(`extractWikiLinks`)로 뽑아 함께 보낸다. 고치면 그 일기의 링크를 지우고 다시 넣는다 |
| `useDeleteDiary()` | `delete_diary` — 링크도 함께 지운다 |

일기는 개인적인 글이라 컨텍스트 팩 · MCP 에 **아직 내지 않는다**. 내기로 하면 VOCAB §7 의 승인 규칙과 함께 별도로 결정한다.

## 4. 결정 로그

- 2026-10-22 네브바에 「개인」 추가. 좌 일기 · 우 사용 방법, 좌우 비율은 홈과 같게.
- 2026-10-22 일기 코드 `D-<날짜>[-k]`, 본문 링크는 `links.from_type = 'diary'`(제약 확장, 0015).
