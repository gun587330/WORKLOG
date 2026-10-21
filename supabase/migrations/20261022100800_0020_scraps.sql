-- ═══════════════════════════════════════════════════════════════════════════
-- 0020 scraps — 스크랩: 형식 제한 없는 파일 · 링크 보관 (코드 S-<n>, docs/VOCAB.md 스크랩)
--   파일 본체는 Supabase Storage 의 비공개 버킷 'scraps'(파일당 50MB), 표에는 메타데이터만.
--   업로드 · 내려받기는 로그인한 소유자만(Storage 정책). 표 접근은 다른 표와 같이 RPC 로만.
--   개인 자료라 컨텍스트 팩 · MCP 에는 내지 않는다(2026-10-22 결정). 본문 [[코드]] 링크는 일기와 같이 links(from_type 'scrap').
-- ═══════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit)
values ('scraps', 'scraps', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

-- Storage 정책: 로그인 = 소유자(루트 CLAUDE.md 절대규칙 3). anon 은 아무것도 못 한다
create policy scraps_owner_select on storage.objects for select to authenticated using (bucket_id = 'scraps');
create policy scraps_owner_insert on storage.objects for insert to authenticated with check (bucket_id = 'scraps');
create policy scraps_owner_update on storage.objects for update to authenticated using (bucket_id = 'scraps') with check (bucket_id = 'scraps');
create policy scraps_owner_delete on storage.objects for delete to authenticated using (bucket_id = 'scraps');

create sequence public.scrap_code_seq start 1;

create table public.scraps (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,                       -- 'S-12'
  kind          text not null check (kind in ('file', 'link')),
  title         text not null,
  note          text,
  tags          text[] not null default '{}',
  url           text,                                       -- kind = link
  storage_path  text unique,                                -- kind = file: 'scraps' 버킷 안 경로
  file_name     text,
  mime_type     text,
  size_bytes    bigint,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check ((kind = 'file' and storage_path is not null) or (kind = 'link' and url is not null))
);
alter table public.scraps enable row level security;
create trigger scraps_set_updated_at before update on public.scraps for each row execute function public.set_updated_at();
create index scraps_created_idx on public.scraps (created_at desc);
comment on table public.scraps is '스크랩(파일 · 링크). 코드 S-<n>. 파일 본체는 Storage 버킷 scraps. deny-all RLS, RPC 로만. 0020';

alter table public.links drop constraint links_from_type_check;
alter table public.links add constraint links_from_type_check check (from_type in ('log', 'item', 'plan', 'plan_item', 'goal', 'diary', 'scrap'));
alter table public.links drop constraint links_to_type_check;
alter table public.links add constraint links_to_type_check check (to_type in ('project', 'goal', 'plan', 'plan_item', 'log', 'diary', 'scrap'));

create or replace function public.list_scraps()
returns setof public.scraps
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_owner();
  return query select * from public.scraps order by created_at desc;
end;
$$;
revoke execute on function public.list_scraps() from public, anon;
grant  execute on function public.list_scraps() to authenticated, service_role;

-- 새로 만들 때: kind · 파일 정보(또는 url) 필수. 고칠 때: 제목 · 메모 · 태그 · 링크만 바뀐다(파일은 바꾸지 않는다)
create or replace function public.upsert_scrap(
  p_id uuid, p_kind text, p_title text, p_note text, p_tags text[], p_url text,
  p_storage_path text, p_file_name text, p_mime_type text, p_size_bytes bigint, p_links jsonb
)
returns public.scraps
language plpgsql security definer set search_path = ''
as $$
declare v public.scraps; l jsonb;
begin
  perform public.assert_owner();
  if nullif(btrim(p_title), '') is null then raise exception '제목은 비울 수 없습니다'; end if;
  if p_id is null then
    if p_kind = 'link' and nullif(btrim(p_url), '') is null then raise exception '링크 주소가 필요합니다'; end if;
    if p_kind = 'file' and nullif(btrim(p_storage_path), '') is null then raise exception '파일 경로가 필요합니다'; end if;
    insert into public.scraps (code, kind, title, note, tags, url, storage_path, file_name, mime_type, size_bytes)
    values ('S-' || nextval('public.scrap_code_seq'), p_kind, btrim(p_title), nullif(btrim(p_note), ''), coalesce(p_tags, '{}'),
            nullif(btrim(p_url), ''), nullif(btrim(p_storage_path), ''), p_file_name, p_mime_type, p_size_bytes)
    returning * into v;
  else
    update public.scraps set title = btrim(p_title), note = nullif(btrim(p_note), ''), tags = coalesce(p_tags, '{}'),
      url = case when kind = 'link' and nullif(btrim(p_url), '') is not null then btrim(p_url) else url end
    where id = p_id returning * into v;
    if v.id is null then raise exception '스크랩을 찾을 수 없습니다'; end if;
    delete from public.links where from_type = 'scrap' and from_id = v.id;
  end if;
  for l in select * from jsonb_array_elements(coalesce(p_links, '[]'::jsonb)) loop
    insert into public.links (from_type, from_id, to_type, to_code, kind, context)
    values ('scrap', v.id, l->>'to_type', upper(l->>'to_code'), coalesce(l->>'kind', 'wikilink'), l->>'context')
    on conflict do nothing;
  end loop;
  return v;
end;
$$;
revoke execute on function public.upsert_scrap(uuid, text, text, text, text[], text, text, text, text, bigint, jsonb) from public, anon;
grant  execute on function public.upsert_scrap(uuid, text, text, text, text[], text, text, text, text, bigint, jsonb) to authenticated, service_role;

-- 지우기: 표 행과 링크를 지우고 Storage 경로를 돌려준다. 파일 본체는 화면이 Storage API 로 지운다(SQL 로 storage.objects 를 지우면 파일이 남는다)
create or replace function public.delete_scrap(p_id uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare v_path text;
begin
  perform public.assert_owner();
  delete from public.links where from_type = 'scrap' and from_id = p_id;
  delete from public.scraps where id = p_id returning storage_path into v_path;
  return v_path;
end;
$$;
revoke execute on function public.delete_scrap(uuid) from public, anon;
grant  execute on function public.delete_scrap(uuid) to authenticated, service_role;
