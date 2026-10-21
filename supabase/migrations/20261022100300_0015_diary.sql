-- ═══════════════════════════════════════════════════════════════════════════
-- 0015 diary — 개인 일기 (코드 D-<YYYY-MM-DD>[-k], docs/VOCAB.md §3)
--   개인 페이지(/me) 왼쪽에서 쓴다. 나중에 일기와 작업 기록 · 계획을 함께 엮어 결과물을 만드는 확장을 위해
--   ① 사람이 읽는 코드를 주고 ② 본문의 [[코드]] 를 links 표에 남긴다(from_type 'diary').
--   일기는 개인적인 글이라 컨텍스트 팩 · MCP 에는 아직 내지 않는다(내기로 하면 별도 결정 + 사용자 승인 규칙).
-- ═══════════════════════════════════════════════════════════════════════════

create table public.diary_entries (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,                    -- 'D-2026-10-22' · 같은 날 둘째부터 'D-2026-10-22-2'
  entry_date  date not null,
  title       text,
  body_md     text not null,
  tags        text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.diary_entries enable row level security;
create trigger diary_entries_set_updated_at before update on public.diary_entries for each row execute function public.set_updated_at();
create index diary_entries_date_idx on public.diary_entries (entry_date desc, created_at desc);
comment on table public.diary_entries is '개인 일기. 코드 D-<날짜>[-k]. 본문 [[코드]] 는 links(from_type diary). deny-all RLS, RPC 로만. 0015';

-- links 가 일기에서 나가는 참조도 담게 한다
alter table public.links drop constraint links_from_type_check;
alter table public.links add constraint links_from_type_check check (from_type in ('log', 'item', 'plan', 'plan_item', 'goal', 'diary'));

create or replace function public.list_diary(p_from date default null, p_to date default null, p_limit int default 200)
returns setof public.diary_entries
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_owner();
  return query select * from public.diary_entries
   where (p_from is null or entry_date >= p_from) and (p_to is null or entry_date <= p_to)
   order by entry_date desc, created_at desc
   limit greatest(1, least(coalesce(p_limit, 200), 2000));
end;
$$;
revoke execute on function public.list_diary(date, date, int) from public, anon;
grant  execute on function public.list_diary(date, date, int) to authenticated, service_role;

-- 저장 = 일기 + 본문 링크를 한 번에. 고칠 때는 그 일기의 링크를 지우고 다시 넣는다
create or replace function public.upsert_diary(p_id uuid, p_entry_date date, p_title text, p_body text, p_tags text[], p_links jsonb)
returns public.diary_entries
language plpgsql security definer set search_path = ''
as $$
declare v public.diary_entries; v_k int; v_code text; l jsonb;
begin
  perform public.assert_owner();
  if p_entry_date is null then raise exception '날짜가 필요합니다'; end if;
  if nullif(btrim(p_body), '') is null then raise exception '일기 본문은 비울 수 없습니다'; end if;
  if p_id is null then
    select count(*) into v_k from public.diary_entries where entry_date = p_entry_date;
    v_code := 'D-' || to_char(p_entry_date, 'YYYY-MM-DD') || case when v_k = 0 then '' else '-' || (v_k + 1) end;
    insert into public.diary_entries (code, entry_date, title, body_md, tags)
    values (v_code, p_entry_date, nullif(btrim(p_title), ''), p_body, coalesce(p_tags, '{}'))
    returning * into v;
  else
    update public.diary_entries set title = nullif(btrim(p_title), ''), body_md = p_body, tags = coalesce(p_tags, '{}')
     where id = p_id returning * into v;
    if v.id is null then raise exception '일기를 찾을 수 없습니다'; end if;
    delete from public.links where from_type = 'diary' and from_id = v.id;
  end if;
  for l in select * from jsonb_array_elements(coalesce(p_links, '[]'::jsonb)) loop
    insert into public.links (from_type, from_id, to_type, to_code, kind, context)
    values ('diary', v.id, l->>'to_type', upper(l->>'to_code'), coalesce(l->>'kind', 'wikilink'), l->>'context')
    on conflict do nothing;
  end loop;
  return v;
end;
$$;
revoke execute on function public.upsert_diary(uuid, date, text, text, text[], jsonb) from public, anon;
grant  execute on function public.upsert_diary(uuid, date, text, text, text[], jsonb) to authenticated, service_role;

create or replace function public.delete_diary(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_owner();
  delete from public.links where from_type = 'diary' and from_id = p_id;
  delete from public.diary_entries where id = p_id;
end;
$$;
revoke execute on function public.delete_diary(uuid) from public, anon;
grant  execute on function public.delete_diary(uuid) to authenticated, service_role;
