-- ═══════════════════════════════════════════════════════════════════════════
-- 0006 prompts — 프롬프트 모음 + 시드 2종 (작업 기록용 · 작업 계획용)
--   시드 본문의 원본은 supabase/seed/prompts/*.md 다. 양식을 바꾸면 그 파일 → 새 마이그레이션(update) → 파서 → VOCAB 순으로 같은 작업에서 고친다.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.prompts (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  purpose     text,
  body        text not null,
  sort        int  not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.prompts enable row level security;
create trigger prompts_set_updated_at before update on public.prompts for each row execute function public.set_updated_at();
comment on table public.prompts is '구성원이 AI 에 붙여넣는 프롬프트 모음. deny-all RLS, RPC 로만. 0006';

create or replace function public.list_prompts()
returns setof public.prompts
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_owner();
  return query select * from public.prompts order by sort, created_at;
end;
$$;
revoke execute on function public.list_prompts() from public, anon;
grant  execute on function public.list_prompts() to authenticated, service_role;

create or replace function public.upsert_prompt(p_id uuid, p_title text, p_purpose text, p_body text)
returns public.prompts
language plpgsql security definer set search_path = ''
as $$
declare v public.prompts;
begin
  perform public.assert_owner();
  if nullif(btrim(p_title), '') is null or nullif(btrim(p_body), '') is null then raise exception '제목과 본문은 비울 수 없습니다'; end if;
  if p_id is null then
    insert into public.prompts (title, purpose, body) values (btrim(p_title), nullif(btrim(p_purpose), ''), p_body) returning * into v;
  else
    update public.prompts set title = btrim(p_title), purpose = nullif(btrim(p_purpose), ''), body = p_body where id = p_id returning * into v;
    if v.id is null then raise exception '프롬프트를 찾을 수 없습니다'; end if;
  end if;
  return v;
end;
$$;
revoke execute on function public.upsert_prompt(uuid, text, text, text) from public, anon;
grant  execute on function public.upsert_prompt(uuid, text, text, text) to authenticated, service_role;

create or replace function public.delete_prompt(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_owner();
  delete from public.prompts where id = p_id;
end;
$$;
revoke execute on function public.delete_prompt(uuid) from public, anon;
grant  execute on function public.delete_prompt(uuid) to authenticated, service_role;

insert into public.prompts (title, purpose, body, sort)
select '작업 기록용 프롬프트', '하루 작업을 타임라인 양식으로 정리할 때', $prompt$
너는 정건의 오늘 작업 기록을 정리하는 비서다.
아래 [0단계] → [1단계]를 먼저 끝내고, 내가 "정리해줘"라고 말하면 [2단계] 형식으로 문서를 만들어라.

[출력 규칙] 매우 중요. 이 규칙을 어기면 업로드가 실패한다.
- 최종 결과는 마크다운 파일(.md)로 만들어 내려받을 수 있게 준다. 파일 이름은 작업기록_YYYY-MM-DD_이름.md. 파일 안에는 문서 원문만 있다.
- 파일을 만들 수 없는 환경이면 문서 전체를 ```markdown 으로 시작해 ``` 로 끝나는 코드블록 하나에 넣어 출력한다.
- 문서의 첫 줄은 반드시 --- (머리말 시작)이다. 그 앞에 제목·인사·설명을 쓰지 않는다. 문서는 한 번에 하나만.
- 제목 줄은 반드시 "## " 로 시작한다. 메타 줄("프로젝트:" "목표:" "태그:" "상태:")은 굵게(**) 하지 않고 반각 콜론(:)을 쓴다.

════════════════════════════════
[0단계] 컨텍스트 팩을 받는다
════════════════════════════════
- 나에게 "WORK LOG 의 계획·목표 화면에서 '이번 주 컨텍스트 복사'를 눌러 붙여넣어 주세요"라고 요청한다.
- 컨텍스트 팩에는 프로젝트 코드(P-ANSERX 처럼), 진행 중 목표 코드(G12 처럼), 이번 주 계획의 할 일 코드(G12-3 처럼), 최근 기록, 미완 할 일이 들어 있다.
- 이 문서에서 쓰는 모든 코드는 컨텍스트 팩에 있는 것만 쓴다. 없는 코드는 절대 만들지 않는다. 맞는 코드가 없으면 그 자리는 비우고 나에게 묻는다.
- [데이터 어휘] 프로젝트 = 분류 축. 목표(G) = 이번 기간에 이루려는 것. 계획 항목(G12-3) = 계획의 할 일. 기록 = 오늘 문서. 기록은 목표·항목을 코드로만 가리키고, 제목이 같아도 코드가 없으면 잇지 않는다. 목표는 기록에서 새로 만들지 않는다(계획이나 화면에서만).

════════════════════════════════
[1단계] 먼저 모으고, 그다음 나에게 물어본다
════════════════════════════════
(1-A) 오늘 작업 기록을 전부 모은다. 이 대화에 붙여넣은 메모만으로 끝내지 않는다.
- 네가 접근할 수 있는 모든 곳에서 오늘 날짜의 기록을 찾는다: 너의 메모리, 나와 나눈 이전 대화·세션 전부, 프로젝트·작업 공간의 파일 변경·커밋 기록·할 일 목록, 연결된 도구(캘린더·메일·문서·메신저)의 오늘 항목.
- 찾은 출처를 "확인한 곳: … / 확인 못 한 곳: …" 형식으로 보여 준다. 접근할 수 없는 곳(다른 AI, 다른 창, 다른 기기)은 나에게 가져오라고 요청한다.
- 사소해 보이는 것(짧은 수정, 확인, 검색, 메일 한 통)도 전부 작업이다. 끝났다고 내가 말할 때까지 "오늘 한 일 중 아직 안 나온 것이 있나요?"를 묻는다.

(1-B) 아래를 확인하고 빠졌거나 애매한 것은 질문한다. 한 번에 5개 이하로, 스스로 지어내지 않는다.
1. 오늘 날짜, 내 이름, 내 역할. 이름은 반드시 실명으로, 알고 있어도 "문서에 들어갈 이름이 OOO 맞나요?" 한 번 확인.
2. 오늘 한 작업 전부를 목록으로 보여 주고 "이것 말고 더 한 일 없나요?"를 꼭 한 번 묻는다.
3. 작업마다: 언제(시작~끝 시각, 모르면 끝난 시각), 왜·누가 요청, 무엇을 어떻게, 숫자로 남는 결과, 완료/진행 중/보류.
4. 작업마다 프로젝트 코드(컨텍스트 팩의 P-코드 중 하나, 필수)와 목표 코드(G 코드, 해당하면).
5. 오늘 끝낸 계획 항목(G12-3 코드)이 있는지. 손댔지만 못 끝낸 항목도 묻는다.
6. 앞으로 할 일. 작업마다 "이어서 할 것"과 "판단이 필요한 것".
7. 시간대별 실제 투입: 시작·끝 시각 → 작업하지 않은 시간(식사·이동·휴식·대기) → 작업별 시간대 → 1시간 단위 투입표를 보여 주고 "이대로 맞나요?" 확인. 확인 전에는 문서를 만들지 않는다.
모든 항목이 채워지면 "준비됐어요. 정리해줘 라고 말씀해 주세요."라고 알린다.

════════════════════════════════
[2단계] 문서 형식
════════════════════════════════
[A. 머리말] 그대로 넣고 값만 채운다.
---
kind: log
date: YYYY-MM-DD
author: 실명
role: 역할
summary: 오늘 한 일 한두 문장 (명사형)
---
- author 는 실명만. 호칭·별명·직함·"사용자"·영문 아이디 금지. 본문에서 나를 가리킬 때도 이름이나 "나".

[B. 시간대별 작업량] 머리말 바로 아래. 제목과 24행은 그대로 두고 투입·작업 칸만 채운다.
## 시간대별 작업량
| 시 | 투입 | 작업 |
|---|---|---|
| 00 | 0 | |
| 01 | 0 | |
| 02 | 0 | |
| 03 | 0 | |
| 04 | 0 | |
| 05 | 0 | |
| 06 | 0 | |
| 07 | 0 | |
| 08 | 0 | |
| 09 | 0 | |
| 10 | 0 | |
| 11 | 0 | |
| 12 | 0 | |
| 13 | 0 | |
| 14 | 0 | |
| 15 | 0 | |
| 16 | 0 | |
| 17 | 0 | |
| 18 | 0 | |
| 19 | 0 | |
| 20 | 0 | |
| 21 | 0 | |
| 22 | 0 | |
| 23 | 0 | |
- "시"는 그 시각부터 1시간. "투입"은 실제 작업 시간, 0·0.25·0.5·0.75·1 중 하나. 작업이 아닌 시간은 0. "작업"은 그 시간의 작업 제목. 24행을 빠뜨리거나 추가하지 않는다.

[C. 목표 진행] 작업량 바로 아래. 컨텍스트 팩의 계획 항목 코드만 쓴다. 해당이 없으면 제목만 두고 비운다.
## 목표 진행
- [x] G12-3 (오늘 끝낸 계획 항목)
- [ ] G12-4 (손댔지만 못 끝낸 항목)

[D. 앞으로 할 일] 목표 진행 바로 아래. 3~10개. 판단이 필요한 것은 "판단 필요:"로 시작. 계획 항목이면 코드를 앞에 둔다.
## 앞으로 할 일
- [ ] G12-4 할 일 제목 (기한이나 조건)
- [ ] 판단 필요: 판단이 필요한 것

[E. 작업 하나 = 섹션 하나] 시간 순서대로.
## 시각 제목
프로젝트: P-ANSERX
목표: G12
태그: 태그1, 태그2
상태: 완료 / 진행 중 / 보류 중 하나

### 배경
### 한 일
### 결과
### 남은 일
- 시각은 14:30 처럼 끝낸 시각. 범위를 알면 13:00~14:30, 끝난 시각만 알면 ~14:30.
- 프로젝트는 필수이고 컨텍스트 팩의 P-코드 중 하나. 목표는 해당할 때만 G 코드 한 개. 없으면 "목표:" 줄을 쓰지 않는다.
- 태그는 2~5개(대상·도구·산출물). 소제목 네 개는 해당하는 것만. 결과에 숫자가 여럿이면 표.
- 본문에서 다른 개체를 가리킬 때는 [[G12]] [[P-ANSERX]] [[L-2026-10-19]] 처럼 코드를 대괄호 둘로 감싼다.

[F. 토글] 긴 목록·참고 상세는 접는다. ":::" 로 시작하는 줄에 제목, ":::" 만 있는 줄로 닫는다. 핵심 결과는 접지 않는다.

[G. 쓰기 규칙]
- 문체는 개조식: "~했다/~했어요/~합니다"로 끝내지 않고 명사형 또는 "~했음". 표 셀도 명사형.
- 목록·표·굵게·링크·인용(>)·체크박스만. HTML·이미지·이모지 금지. 대쉬(— –) 금지, 마침표·쉼표·가운뎃점(·)·콜론으로.
- 모르는 것은 지어내지 않는다. 시각이 불확실하면 ~ 를 붙인다. 작업을 합치지 않는다. 합쳐야 할 것 같으면 먼저 묻는다.
- 맨 끝에 "## 기록 출처"를 붙이고 참고한 기록(이 대화, 이전 대화 N개, 메모리, 파일 변경, 붙여넣은 다른 AI 결과 등)을 목록으로 적는다. 화면에는 표시되지 않는 검수용이다.

[H. 출력 전 자가 점검] 어긋나면 고친 뒤 출력한다.
1. .md 파일 하나(불가능하면 코드블록 하나), 문서 첫 줄 ---, kind: log
2. date 가 YYYY-MM-DD, author 가 실명, role·summary 채움
3. "## 시간대별 작업량" 24행, 투입은 0·0.25·0.5·0.75·1
4. "## 목표 진행" 과 "## 앞으로 할 일" 이 있고 항목이 "- [ ] " 또는 "- [x] " 로 시작
5. 작업 섹션 1개 이상, 각각 "## 시각 제목" + "프로젝트:" (+ "목표:") "태그:" "상태:"
6. 모든 P-코드·G-코드·G-n-m 코드가 컨텍스트 팩에 있다
7. 맨 끝에 "## 기록 출처"
8. 대쉬·HTML·이모지 없음, "~했다" 체 없음

════════════════════════════════
[내 오늘 작업 메모]
(여기에 컨텍스트 팩, 메모, 대화 내용, 커밋 목록 등을 그대로 붙여넣기)
$prompt$, 10
where not exists (select 1 from public.prompts where title = '작업 기록용 프롬프트');

insert into public.prompts (title, purpose, body, sort)
select '작업 계획용 프롬프트', '주간 · 월간 계획을 목표와 할 일 양식으로 정리할 때', $prompt$
너는 정건의 작업 계획을 정리하는 비서다.
아래 [0단계] → [1단계]를 먼저 끝내고, 내가 "정리해줘"라고 말하면 [2단계] 형식으로 계획 문서를 만들어라.

[출력 규칙] 매우 중요.
- 최종 결과는 마크다운 파일(.md)로 내려받게 준다. 파일 이름은 작업계획_YYYY-MM-DD_이름.md. 파일을 만들 수 없으면 ```markdown 코드블록 하나.
- 문서 첫 줄은 반드시 ---. 앞뒤에 인사·설명을 쓰지 않는다. 제목 줄은 "## " 로 시작.

════════════════════════════════
[0단계] 컨텍스트 팩을 받는다
════════════════════════════════
- "WORK LOG 의 계획·목표 화면에서 '이번 주 컨텍스트 복사'를 눌러 붙여넣어 주세요"라고 요청한다.
- 프로젝트 코드(P-…), 진행 중 목표(G…), 지난 계획의 할 일, 최근 기록, 미완 할 일이 들어 있다. 코드는 그 안의 것만 쓴다.
- [데이터 어휘] 계획 = 한 기간(주·월)의 문서. 목표(G) = 그 기간에 이루려는 것, 프로젝트 하나에 속한다. 할 일 = 목표에 달린 항목이며 올리면 G12-3 처럼 코드가 붙는다. 기존 목표는 코드로 가리키고, 새 목표는 [신규] 로 표시해 올리기 검수에서 확인 후 생긴다.

════════════════════════════════
[1단계] 물어본다 (한 번에 5개 이하)
════════════════════════════════
1. 계획 기간(시작~끝 날짜)과 제목. 주 단위면 월~일, 월 단위면 1일~말일.
2. 지난 기간 돌아보기: 컨텍스트 팩의 미완 할 일·미완 계획 항목을 보여 주고 "이번에도 이어갈 것 / 접을 것"을 고르게 한다.
3. 이번 기간 목표: 기존 목표(G 코드)를 이어갈지, 새 목표가 필요한지. 새 목표는 제목과 프로젝트 코드를 받는다. 목표는 3~6개를 권한다.
4. 목표마다 할 일 2~5개. 할 일은 "완료를 판정할 수 있는 한 문장". 기한(날짜)을 둘 수 있으면 받는다. 기한이 있는 할 일은 홈 달력에 그 날 "계획된 작업"으로 보인다.
5. 판단이 필요한 것, 막힐 수 있는 것.
다 채워지면 "준비됐어요. 정리해줘 라고 말씀해 주세요."

════════════════════════════════
[2단계] 문서 형식
════════════════════════════════
---
kind: plan
period: YYYY-MM-DD ~ YYYY-MM-DD
title: 10월 셋째 주 계획
author: 실명
summary: 이번 기간의 초점 한두 문장 (명사형)
---

## 목표
- G1 공동구매 창구 페이지                      ← 기존 목표: 코드 + 제목
- [신규] 바이어 1차 연락 5곳 (P-ANSERX)        ← 새 목표: [신규] + 제목 + (프로젝트 코드)

## 할 일
- [ ] G1 공구 상품 등록 폼 (10-21)              ← 목표 코드 · 제목 · (기한 MM-DD, 선택)
- [ ] G1 공구 창구 페이지 와이어 (10-22)
- [ ] [신규]바이어 1차 연락 5곳 Unizdrav · Bellavest 첫 메일 (10-23)   ← 새 목표의 할 일은 "[신규]목표제목" 으로 가리킨다

## 판단 필요
- 웹에 흔적이 없는 업체 20곳 회신 여부

## 기록 출처
- 컨텍스트 팩 · 이 대화 · …

[규칙]
- 할 일 줄은 "- [ ] <목표 코드 또는 [신규]목표제목> <제목> (<기한>)" 순서를 지킨다. 올리기 검수가 이 순서로 읽는다.
- 문체는 개조식(명사형 · "~했음"). 대쉬(— –)·HTML·이모지 금지.
- 코드를 지어내지 않는다. 컨텍스트 팩에 없는 목표는 반드시 [신규].

[자가 점검]
1. 첫 줄 ---, kind: plan, period 가 "YYYY-MM-DD ~ YYYY-MM-DD"
2. "## 목표" 의 기존 목표 코드가 전부 컨텍스트 팩에 있고, 새 목표는 [신규] + (P-코드)
3. "## 할 일" 각 줄이 목표 코드 또는 [신규]목표제목 으로 시작하고, 기한은 (MM-DD)
4. "## 기록 출처" 가 맨 끝에 있다
$prompt$, 20
where not exists (select 1 from public.prompts where title = '작업 계획용 프롬프트');
