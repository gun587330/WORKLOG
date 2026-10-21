-- ═══════════════════════════════════════════════════════════════════════════
-- 0003 projects — 분류 축 "프로젝트"(코드 P-<SLUG>, docs/VOCAB.md §3) + 시드 10개 + RPC
--   카테고리를 DB 로 두는 이유: 화면에서 늘리고, 기록 · 목표가 외래키로 잇기 위해(이름 비교 금지, VOCAB §2).
-- ═══════════════════════════════════════════════════════════════════════════

create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[A-Z0-9][A-Z0-9-]{0,30}$'),  -- 코드 뒷부분. P-<slug>
  name        text not null,
  abbr        text not null check (char_length(abbr) between 1 and 3),           -- 달력 약칭
  description text,
  status      text not null default 'active' check (status in ('active', 'archived')),
  sort        int  not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.projects enable row level security;
create trigger projects_set_updated_at before update on public.projects for each row execute function public.set_updated_at();
comment on table public.projects is '프로젝트(분류 축). 코드 P-<slug>. deny-all RLS, RPC 로만. VOCAB §3. 0003';

insert into public.projects (slug, name, abbr, sort) values
  ('ANSERX',        'ANSERX',              'AX', 10),
  ('AI-STUDY',      'AI STUDY',            'AI', 20),
  ('TRADE-STUDY',   '무역 STUDY',           'TR', 30),
  ('SAJU',          '사주·운세 앱',          'SJ', 40),
  ('AI-CONTENT-BM', 'AI 콘텐츠 제작 BM',     'CB', 50),
  ('KORION-PAY',    '코리온페이 벤치마크',    'KP', 60),
  ('AI-VIDEO-MKT',  'AI 영상 제작 마케팅',    'VM', 70),
  ('WORKLOG',       'WORK LOG',            'WL', 80),
  ('STARTUP',       '창업 활동',             'ST', 90),
  ('ETC',           '기타',                 'ET', 100)
on conflict (slug) do nothing;

create or replace function public.list_projects(p_include_archived boolean default false)
returns setof public.projects
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_owner();
  return query select * from public.projects p
    where p_include_archived or p.status = 'active'
    order by p.sort, p.name;
end;
$$;
revoke execute on function public.list_projects(boolean) from public, anon;
grant  execute on function public.list_projects(boolean) to authenticated, service_role;

create or replace function public.upsert_project(
  p_id uuid, p_slug text, p_name text, p_abbr text, p_description text, p_sort int
)
returns public.projects
language plpgsql security definer set search_path = ''
as $$
declare v public.projects;
begin
  perform public.assert_owner();
  if nullif(btrim(p_name), '') is null then raise exception '프로젝트 이름은 비울 수 없습니다'; end if;
  if p_id is null then
    insert into public.projects (slug, name, abbr, description, sort)
    values (upper(btrim(p_slug)), btrim(p_name), upper(btrim(p_abbr)), nullif(btrim(p_description), ''), coalesce(p_sort, 100))
    returning * into v;
  else
    update public.projects set
      slug = upper(btrim(p_slug)), name = btrim(p_name), abbr = upper(btrim(p_abbr)),
      description = nullif(btrim(p_description), ''), sort = coalesce(p_sort, sort)
    where id = p_id returning * into v;
    if v.id is null then raise exception '프로젝트를 찾을 수 없습니다'; end if;
  end if;
  return v;
end;
$$;
revoke execute on function public.upsert_project(uuid, text, text, text, text, int) from public, anon;
grant  execute on function public.upsert_project(uuid, text, text, text, text, int) to authenticated, service_role;

-- 삭제 대신 보관: 과거 기록이 가리키는 프로젝트가 사라지면 안 된다
create or replace function public.set_project_status(p_id uuid, p_status text)
returns public.projects
language plpgsql security definer set search_path = ''
as $$
declare v public.projects;
begin
  perform public.assert_owner();
  update public.projects set status = p_status where id = p_id returning * into v;
  if v.id is null then raise exception '프로젝트를 찾을 수 없습니다'; end if;
  return v;
end;
$$;
revoke execute on function public.set_project_status(uuid, text) from public, anon;
grant  execute on function public.set_project_status(uuid, text) to authenticated, service_role;
