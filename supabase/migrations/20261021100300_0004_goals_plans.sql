-- ═══════════════════════════════════════════════════════════════════════════
-- 0004 goals_plans — 목표(G<n>) · 계획(PL-…) · 계획 항목(G<n>-<m>) + RPC (docs/VOCAB.md §3)
--   목표 코드는 시퀀스로 발급하고 재사용하지 않는다(SCHEMA §10). 계획 항목 완료는 0005 의 기록 적재가 잇는다.
-- ═══════════════════════════════════════════════════════════════════════════

create sequence public.goal_code_seq start 1;

create table public.goals (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,                       -- 'G12'
  title        text not null,
  project_id   uuid not null references public.projects (id),
  period_start date,
  period_end   date,
  status       text not null default 'active' check (status in ('active', 'done', 'paused')),
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.goals enable row level security;
create trigger goals_set_updated_at before update on public.goals for each row execute function public.set_updated_at();
create index goals_project_idx on public.goals (project_id, status);
comment on table public.goals is '목표. 코드 G<n>(시퀀스, 재사용 없음). 프로젝트에 속하고 계획 항목이 달린다. VOCAB §3. 0004';

create table public.plans (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,                       -- 'PL-2026-W43' | 'PL-2026-10'
  title        text not null,
  period_start date not null,
  period_end   date not null check (period_end >= period_start),
  status       text not null default 'active' check (status in ('active', 'done')),
  summary      text,
  raw_md       text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.plans enable row level security;
create trigger plans_set_updated_at before update on public.plans for each row execute function public.set_updated_at();
create index plans_period_idx on public.plans (period_start desc);
comment on table public.plans is '기간 단위 계획 문서(md 업로드). 원문 raw_md 보존. VOCAB §3. 0004';

create table public.plan_items (
  id           uuid primary key default gen_random_uuid(),
  plan_id      uuid not null references public.plans (id) on delete cascade,
  goal_id      uuid not null references public.goals (id),
  code         text not null unique,                       -- 'G12-3'
  seq          int  not null,
  title        text not null,
  due_date     date,
  status       text not null default 'open' check (status in ('open', 'done')),
  done_log_id  uuid,                                       -- 0005 에서 FK 를 건다
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (goal_id, seq)
);
alter table public.plan_items enable row level security;
create trigger plan_items_set_updated_at before update on public.plan_items for each row execute function public.set_updated_at();
create index plan_items_plan_idx on public.plan_items (plan_id);
create index plan_items_due_idx on public.plan_items (due_date);
comment on table public.plan_items is '계획의 할 일. 코드 G<n>-<m>, 목표당 순번. due_date 가 있으면 달력의 계획된 작업. VOCAB §3. 0004';

-- ── 목표 RPC ─────────────────────────────────────────────────────────────────
create or replace function public.list_goals(p_status text default null)
returns table (
  id uuid, code text, title text, project_id uuid, project_slug text, project_name text,
  period_start date, period_end date, status text, note text,
  item_count int, done_count int, created_at timestamptz, updated_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_owner();
  return query
  select g.id, g.code, g.title, g.project_id, p.slug, p.name, g.period_start, g.period_end, g.status, g.note,
         (select count(*)::int from public.plan_items i where i.goal_id = g.id),
         (select count(*)::int from public.plan_items i where i.goal_id = g.id and i.status = 'done'),
         g.created_at, g.updated_at
  from public.goals g join public.projects p on p.id = g.project_id
  where p_status is null or g.status = p_status
  order by g.status = 'active' desc, g.period_end nulls last, g.code;
end;
$$;
revoke execute on function public.list_goals(text) from public, anon;
grant  execute on function public.list_goals(text) to authenticated, service_role;

create or replace function public.upsert_goal(
  p_id uuid, p_title text, p_project_slug text, p_period_start date, p_period_end date, p_status text, p_note text
)
returns public.goals
language plpgsql security definer set search_path = ''
as $$
declare v public.goals; v_project uuid;
begin
  perform public.assert_owner();
  if nullif(btrim(p_title), '') is null then raise exception '목표 제목은 비울 수 없습니다'; end if;
  select id into v_project from public.projects where slug = upper(btrim(p_project_slug));
  if v_project is null then raise exception '프로젝트 코드를 찾을 수 없습니다: P-%', p_project_slug; end if;
  if p_id is null then
    insert into public.goals (code, title, project_id, period_start, period_end, status, note)
    values ('G' || nextval('public.goal_code_seq'), btrim(p_title), v_project, p_period_start, p_period_end,
            coalesce(p_status, 'active'), nullif(btrim(p_note), ''))
    returning * into v;
  else
    update public.goals set title = btrim(p_title), project_id = v_project, period_start = p_period_start,
      period_end = p_period_end, status = coalesce(p_status, status), note = nullif(btrim(p_note), '')
    where id = p_id returning * into v;
    if v.id is null then raise exception '목표를 찾을 수 없습니다'; end if;
  end if;
  return v;
end;
$$;
revoke execute on function public.upsert_goal(uuid, text, text, date, date, text, text) from public, anon;
grant  execute on function public.upsert_goal(uuid, text, text, date, date, text, text) to authenticated, service_role;

-- 계획 항목이 달린 목표는 지우지 않는다(과거 기록이 가리킨다). 상태를 paused/done 으로 바꾸는 쪽을 쓴다.
create or replace function public.delete_goal(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_owner();
  if exists (select 1 from public.plan_items where goal_id = p_id) then
    raise exception '계획 항목이 달린 목표는 지울 수 없습니다. 상태를 바꿔 주세요';
  end if;
  delete from public.goals where id = p_id;
end;
$$;
revoke execute on function public.delete_goal(uuid) from public, anon;
grant  execute on function public.delete_goal(uuid) to authenticated, service_role;

-- ── 계획 RPC ─────────────────────────────────────────────────────────────────
-- 올리기: 파서가 뽑은 목표 목록(기존 코드 또는 [신규])과 할 일 목록을 한 트랜잭션으로 적재한다.
--   p_goals: [{ "ref": "G1" | "N1", "title": "...", "project_slug": "ANSERX", "is_new": true|false }]
--   p_items: [{ "goal_ref": "G1" | "N1", "title": "...", "due_date": "2026-10-21" | null }]
--   순번(seq)은 목표별로 기존 최대값 다음부터 이어 붙인다 → 코드 G1-3 …
create or replace function public.insert_plan(
  p_code text, p_title text, p_period_start date, p_period_end date, p_summary text, p_raw_md text,
  p_goals jsonb, p_items jsonb
)
returns public.plans
language plpgsql security definer set search_path = ''
as $$
declare
  v public.plans; g jsonb; it jsonb; v_goal_id uuid; v_project uuid; v_code text; v_seq int;
  refmap jsonb := '{}'::jsonb;   -- ref → goal id
begin
  perform public.assert_owner();
  if nullif(btrim(p_raw_md), '') is null then raise exception '원문이 비어 있습니다'; end if;
  if exists (select 1 from public.plans where code = p_code) then raise exception '같은 코드의 계획이 이미 있습니다: %', p_code; end if;

  insert into public.plans (code, title, period_start, period_end, summary, raw_md)
  values (p_code, btrim(p_title), p_period_start, p_period_end, nullif(btrim(p_summary), ''), p_raw_md)
  returning * into v;

  for g in select * from jsonb_array_elements(coalesce(p_goals, '[]'::jsonb)) loop
    if coalesce((g->>'is_new')::boolean, false) then
      select id into v_project from public.projects where slug = upper(btrim(g->>'project_slug'));
      if v_project is null then raise exception '프로젝트 코드를 찾을 수 없습니다: P-%', g->>'project_slug'; end if;
      insert into public.goals (code, title, project_id, period_start, period_end)
      values ('G' || nextval('public.goal_code_seq'), btrim(g->>'title'), v_project, p_period_start, p_period_end)
      returning id into v_goal_id;
    else
      select id into v_goal_id from public.goals where code = upper(btrim(g->>'ref'));
      if v_goal_id is null then raise exception '목표 코드를 찾을 수 없습니다: %', g->>'ref'; end if;
    end if;
    refmap := refmap || jsonb_build_object(upper(btrim(g->>'ref')), v_goal_id::text);
  end loop;

  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_goal_id := (refmap->>upper(btrim(it->>'goal_ref')))::uuid;
    if v_goal_id is null then
      -- 목표 목록에 없지만 기존 코드면 허용
      select id into v_goal_id from public.goals where code = upper(btrim(it->>'goal_ref'));
      if v_goal_id is null then raise exception '할 일이 가리키는 목표를 찾을 수 없습니다: %', it->>'goal_ref'; end if;
    end if;
    select coalesce(max(seq), 0) + 1 into v_seq from public.plan_items where goal_id = v_goal_id;
    select code into v_code from public.goals where id = v_goal_id;
    insert into public.plan_items (plan_id, goal_id, code, seq, title, due_date)
    values (v.id, v_goal_id, v_code || '-' || v_seq, v_seq, btrim(it->>'title'), nullif(it->>'due_date', '')::date);
  end loop;
  return v;
end;
$$;
revoke execute on function public.insert_plan(text, text, date, date, text, text, jsonb, jsonb) from public, anon;
grant  execute on function public.insert_plan(text, text, date, date, text, text, jsonb, jsonb) to authenticated, service_role;

create or replace function public.list_plans()
returns table (
  id uuid, code text, title text, period_start date, period_end date, status text, summary text,
  goal_count int, item_count int, done_count int, project_slugs text[], created_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_owner();
  return query
  select pl.id, pl.code, pl.title, pl.period_start, pl.period_end, pl.status, pl.summary,
    (select count(distinct i.goal_id)::int from public.plan_items i where i.plan_id = pl.id),
    (select count(*)::int from public.plan_items i where i.plan_id = pl.id),
    (select count(*)::int from public.plan_items i where i.plan_id = pl.id and i.status = 'done'),
    (select coalesce(array_agg(distinct p.slug order by p.slug), '{}') from public.plan_items i
       join public.goals g on g.id = i.goal_id join public.projects p on p.id = g.project_id where i.plan_id = pl.id),
    pl.created_at
  from public.plans pl order by pl.period_start desc, pl.created_at desc;
end;
$$;
revoke execute on function public.list_plans() from public, anon;
grant  execute on function public.list_plans() to authenticated, service_role;

create or replace function public.get_plan(p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v jsonb;
begin
  perform public.assert_owner();
  select jsonb_build_object(
    'plan', to_jsonb(pl),
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id, 'code', i.code, 'title', i.title, 'due_date', i.due_date, 'status', i.status,
        'goal_code', g.code, 'goal_title', g.title, 'project_slug', p.slug, 'done_log_id', i.done_log_id)
        order by g.code, i.seq), '[]'::jsonb)
      from public.plan_items i join public.goals g on g.id = i.goal_id join public.projects p on p.id = g.project_id
      where i.plan_id = pl.id)
  ) into v from public.plans pl where pl.id = p_id;
  if v is null then raise exception '계획을 찾을 수 없습니다'; end if;
  return v;
end;
$$;
revoke execute on function public.get_plan(uuid) from public, anon;
grant  execute on function public.get_plan(uuid) to authenticated, service_role;

create or replace function public.delete_plan(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_owner();
  delete from public.plans where id = p_id;   -- plan_items cascade
end;
$$;
revoke execute on function public.delete_plan(uuid) from public, anon;
grant  execute on function public.delete_plan(uuid) to authenticated, service_role;

-- 손으로 체크(기록 없이 완료 · 되돌리기). 기록이 완료를 보고한 항목(done_log_id 있음)은 0005 의 기록 삭제가 되돌린다.
create or replace function public.set_plan_item_status(p_id uuid, p_status text)
returns public.plan_items
language plpgsql security definer set search_path = ''
as $$
declare v public.plan_items;
begin
  perform public.assert_owner();
  update public.plan_items set status = p_status, done_log_id = case when p_status = 'open' then null else done_log_id end
  where id = p_id returning * into v;
  if v.id is null then raise exception '계획 항목을 찾을 수 없습니다'; end if;
  return v;
end;
$$;
revoke execute on function public.set_plan_item_status(uuid, text) from public, anon;
grant  execute on function public.set_plan_item_status(uuid, text) to authenticated, service_role;
