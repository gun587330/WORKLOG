# 스크랩 명세 (/scraps)

> 이 화면의 단일 명세서. 최종 수정: 2026-10-22 · 상태: **1차 구현 완료**
> 구현체: 이 폴더 `page.tsx` + `components/worklog/scraps-view.tsx` · `worklog.module.css`(`.scrap*`) + `lib/api/worklog.ts`(스크랩 절) · `hooks/use-worklog.ts`
> 서버: `scraps` + `list_scraps` · `upsert_scrap` · `delete_scrap` + Storage 비공개 버킷 `scraps`(파일당 50MB, 소유자만) (0020) · 어휘: `docs/VOCAB.md` 스크랩

## 1. 목적

형식 제한 없이 개인 자료를 모아 둔다(시안 HTML · 이미지 · PDF · 문서 · 압축 파일 · 링크). 일기처럼 코드(`S-<n>`)를 주고 메모의 `[[코드]]` 를 links 에 남겨, 나중에 일기 · 작업과 함께 엮을 수 있게 한다.
개인 자료라 컨텍스트 팩 · 클로드 연결(MCP)에는 내지 않는다(2026-10-22 결정).

## 2. 레이아웃 (세로 100%)

- 박스 하나: 머리 [스크랩 N개 · 최근순 | 종류 칩(전체 · 이미지 · 문서 · 웹 페이지 · 링크 · 기타, 있는 것만) | 올리기(블랙 sm)] · 카드 격자(최소 13rem, 세로 스크롤) · 푸터 2줄.
- **카드**: 위 썸네일(이미지는 그 이미지, 링크는 링크 아이콘, 나머지는 확장자 글자) · 제목 · 코드 · 크기(링크는 도메인) · 올린 날 · 태그. 누르면 보기 모달.
- **올리기 모달**(lg): 세그먼트[파일 | 링크]. 파일 = 끌어다 놓기 · 여러 개 · 50MB 넘는 것은 빼고 알림, 목록에서 빼기, 한 개일 때만 제목. 링크 = 주소(https) · 제목. 공통 = 메모 · 태그.
- **보기 모달**(wide): 왼쪽 미리보기 · 오른쪽 정보 폼(제목 · 링크 주소 · 메모 · 태그 · 파일 정보). 미리보기: 이미지 = 그대로, PDF = 브라우저 뷰어, HTML = 격리 iframe(srcdoc + sandbox 스크립트만, 사이트 쿠키 접근 없음), 텍스트 · md · csv · json = 원문, 그 밖 = "미리보기 없음". 푸터: [삭제](왼쪽, 확인 모달 → 표 행 · 링크 · 파일 본체) · [내려받기] 또는 [링크 열기] · [새 탭에서 열기](이미지 · PDF · HTML) · [닫기] · [저장].

## 3. 데이터

| 훅 | 동작 |
|---|---|
| `useScraps()` | `list_scraps` |
| `useUploadScrapFile()` | Storage `scraps/<uuid>/<안전한 파일명>` 에 올린 뒤 `upsert_scrap`(kind file). 표 기록이 실패하면 올린 파일을 지운다 |
| `useAddScrapLink()` | `upsert_scrap`(kind link) |
| `useUpdateScrap()` | `upsert_scrap`(id 있음): 제목 · 메모 · 태그 · 링크 주소만. 파일은 바꾸지 않는다 |
| `useDeleteScrap()` | `delete_scrap` 이 경로를 돌려주면 Storage API 로 파일 본체를 지운다 |
| `scrapSignedUrl()` | 비공개 파일을 1시간 동안 여는 주소(내려받기는 파일명 지정) |

## 4. 결정 로그

- 2026-10-22 네브바 「스크랩」(개인 위). 파일당 50MB, 직접 만든 파일 기준(HTML 은 격리 iframe 으로 실행), MCP 제외.
- 2026-10-22 올린 날은 내 시간대로 표시(UTC 날짜를 자르면 한국 오전에 하루 전으로 나온다).
