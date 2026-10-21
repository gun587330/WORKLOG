-- ═══════════════════════════════════════════════════════════════════════════
-- 0005 work_logs — 하루 기록(L-<날짜>) · 작업(#n) · 시간표 · 앞으로 할 일 · 달성 + RPC (docs/VOCAB.md §3)
--   기록은 append-only(유일 조건 없음, anserx 0068 의 교훈). 적재는 insert_work_log 한 트랜잭션.
--   계획 항목 완료는 기록 md 의 `## 목표 진행` 코드로만 잇는다(SCHEMA §10).
-- ═══════════════════════════════════════════════════════════════════════════

create table public.work_logs (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,                 -- 'L-2026-10-19' · 같은 날 둘째부터 'L-2026-10-19-2'
  log_date     date not null,
  author_name  text not null,
  summary      text,
  raw_md       text not null,
  task_count   int  not null default 0,
  done_count   int  not null default 0,
  hours_total  numeric(4,2) not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.work_logs enable row level security;
create trigger work_logs_set_updated_at before update on public.work_logs for each row execute function public.set_updated_at();
create index work_logs_date_idx on public.work_logs (log_date desc, created_at desc);
comment on table public.work_logs is '하루 작업 기록 문서. 코드 L-<날짜>[-k]. 원문 raw_md 보존, 올릴 때마다 새 행. VOCAB §3. 0005';

alter table public.plan_items
  add constraint plan_items_done_log_fk foreign key (done_log_id) references public.work_logs (id) on delete set null;

create table public.work_items (
  id          uuid primary key default gen_random_uuid(),
  log_id      uuid not null references public.work_logs (id) on delete cascade,
  seq         int  not null,
  code        text not null unique,                  -- 'L-2026-10-19#3'
  time_text   text,                                  -- '~11:44' · '13:00~14:30' 원문
  hour_end    int  check (hour_end between 0 and 23),
  title       text not null,
  project_id  uuid not null references public.projects (id),
  goal_id     uuid references public.goals (id),
  status      text not null default '' check (status in ('완료', '진행 중', '보류', '')),
  tags        text[] not null default '{}',
  body_md     text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (log_id, seq)
);
alter table public.work_items enable row level security;
create trigger work_items_set_updated_at before update on public.work_items for each row execute function public.set_updated_at();
create index work_items_project_idx on public.work_items (project_id);
create index work_items_goal_idx on public.work_items (goal_id);
comment on table public.work_items is '기록 안 작업 하나(## 시각 제목 섹션). 프로젝트 필수, 목표 선택. VOCAB §3. 0005';

create table public.work_hours (
  log_id      uuid not null references public.work_logs (id) on delete cascade,
  hour        int  not null check (hour between 0 and 23),
  value       numeric(3,2) not null check (value in (0, 0.25, 0.5, 0.75, 1)),
  label       text not null default '',
  primary key (log_id, hour)
);
alter table public.work_hours enable row level security;
comment on table public.work_hours is '기록의 24시간 투입표. 0.25 단위. 0005';

create table public.log_todos (
  id             uuid primary key default gen_random_uuid(),
  log_id         uuid not null references public.work_logs (id) on delete cascade,
  seq            int  not null,
  text           text not null,
  needs_decision boolean not null default false,
  done           boolean not null default false,
  plan_item_id   uuid references public.plan_items (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.log_todos enable row level security;
create trigger log_todos_set_updated_at before update on public.log_todos for each row execute function public.set_updated_at();
comment on table public.log_todos is '기록의 「앞으로 할 일」. 홈에서 체크. 코드가 있으면 계획 항목과 연결. 0005';

create table public.item_completions (
  plan_item_id uuid primary key references public.plan_items (id) on delete cascade,
  log_id       uuid not null references public.work_logs (id) on delete cascade,
  created_at   timestamptz not null default now()
);
alter table public.item_completions enable row level security;
comment on table public.item_completions is '어느 기록이 어느 계획 항목을 끝냈는지. 한 항목은 한 번만. 0005';

-- ── 올리기 ───────────────────────────────────────────────────────────────────
--   p_items: [{ seq, time_text, hour_end, title, project_slug, goal_code|null, status, tags[], body_md }]
--   p_hours: [{ hour, value, label }]   p_todos: [{ seq, text, needs_decision, plan_item_code|null }]
--   p_completions: ["G12-3", …]  (## 목표 진행 의 [x])
create or replace function public.insert_work_log(
  p_log_date date, p_author_name text, p_summary text, p_raw_md text,
  p_items jsonb, p_hours jsonb, p_todos jsonb, p_completions text[]
)
returns public.work_logs
language plpgsql security definer set search_path = ''
as $$
declare
  v public.work_logs; it jsonb; h jsonb; td jsonb; c text;
  v_k int; v_code text; v_project uuid; v_goal uuid; v_pi uuid; v_done int := 0; v_hours numeric := 0;
begin
  perform public.assert_owner();
  if nullif(btrim(p_author_name), '') is null then raise exception '머리말의 author(실명)가 비어 있습니다'; end if;
  if nullif(btrim(p_raw_md), '') is null then raise exception '원문이 비어 있습니다'; end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception '작업 섹션이 하나도 없습니다'; end if;

  select count(*) into v_k from public.work_logs where log_date = p_log_date;
  v_code := 'L-' || to_char(p_log_date, 'YYYY-MM-DD') || case when v_k = 0 then '' else '-' || (v_k + 1) end;

  select coalesce(sum((x->>'value')::numeric), 0) into v_hours from jsonb_array_elements(coalesce(p_hours, '[]'::jsonb)) x;
  select count(*) into v_done from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x where x->>'status' = '완료';

  insert into public.work_logs (code, log_date, author_name, summary, raw_md, task_count, done_count, hours_total)
  values (v_code, p_log_date, btrim(p_author_name), nullif(btrim(p_summary), ''), p_raw_md,
          jsonb_array_length(p_items), v_done, v_hours)
  returning * into v;

  for it in select * from jsonb_array_elements(p_items) loop
    select id into v_project from public.projects where slug = upper(btrim(coalesce(it->>'project_slug', '')));
    if v_project is null then raise exception '작업 「%」의 프로젝트 코드를 찾을 수 없습니다: P-%', it->>'title', it->>'project_slug'; end if;
    v_goal := null;
    if nullif(it->>'goal_code', '') is not null then
      select id into v_goal from public.goals where code = upper(btrim(it->>'goal_code'));
      if v_goal is null then raise exception '작업 「%」의 목표 코드를 찾을 수 없습니다: %', it->>'title', it->>'goal_code'; end if;
    end if;
    insert into public.work_items (log_id, seq, code, time_text, hour_end, title, project_id, goal_id, status, tags, body_md)
    values (v.id, (it->>'seq')::int, v_code || '#' || (it->>'seq'), it->>'time_text', nullif(it->>'hour_end', '')::int,
            btrim(it->>'title'), v_project, v_goal, coalesce(it->>'status', ''),
            coalesce((select array_agg(value) from jsonb_array_elements_text(coalesce(it->'tags', '[]'::jsonb))), '{}'),
            coalesce(it->>'body_md', ''));
  end loop;

  for h in select * from jsonb_array_elements(coalesce(p_hours, '[]'::jsonb)) loop
    insert into public.work_hours (log_id, hour, value, label)
    values (v.id, (h->>'hour')::int, (h->>'value')::numeric, coalesce(h->>'label', ''))
    on conflict (log_id, hour) do update set value = excluded.value, label = excluded.label;
  end loop;

  for td in select * from jsonb_array_elements(coalesce(p_todos, '[]'::jsonb)) loop
    v_pi := null;
    if nullif(td->>'plan_item_code', '') is not null then
      select id into v_pi from public.plan_items where code = upper(btrim(td->>'plan_item_code'));
    end if;
    insert into public.log_todos (log_id, seq, text, needs_decision, plan_item_id)
    values (v.id, (td->>'seq')::int, btrim(td->>'text'), coalesce((td->>'needs_decision')::boolean, false), v_pi);
  end loop;

  foreach c in array coalesce(p_completions, '{}') loop
    select id into v_pi from public.plan_items where code = upper(btrim(c));
    if v_pi is null then raise exception '목표 진행의 코드를 찾을 수 없습니다: %', c; end if;
    insert into public.item_completions (plan_item_id, log_id) values (v_pi, v.id) on conflict (plan_item_id) do nothing;
    update public.plan_items set status = 'done', done_log_id = coalesce(done_log_id, v.id) where id = v_pi;
  end loop;
  return v;
end;
$$;
revoke execute on function public.insert_work_log(date, text, text, text, jsonb, jsonb, jsonb, text[]) from public, anon;
grant  execute on function public.insert_work_log(date, text, text, text, jsonb, jsonb, jsonb, text[]) to authenticated, service_role;

-- 목록 — 원문 없이 카드용 요약. 프로젝트 필터는 작업 단위로 본다(기록 하나가 여러 프로젝트를 담는다)
create or replace function public.list_work_logs(p_project_slug text default null, p_from date default null, p_to date default null, p_limit int default 200)
returns table (
  id uuid, code text, log_date date, author_name text, summary text, task_count int, done_count int, hours_total numeric,
  project_slugs text[], created_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_owner();
  return query
  select l.id, l.code, l.log_date, l.author_name, l.summary, l.task_count, l.done_count, l.hours_total,
    (select coalesce(array_agg(distinct p.slug order by p.slug), '{}') from public.work_items i join public.projects p on p.id = i.project_id where i.log_id = l.id),
    l.created_at
  from public.work_logs l
  where (p_from is null or l.log_date >= p_from) and (p_to is null or l.log_date <= p_to)
    and (p_project_slug is null or exists (select 1 from public.work_items i join public.projects p on p.id = i.project_id
                                           where i.log_id = l.id and p.slug = upper(p_project_slug)))
  order by l.log_date desc, l.created_at desc
  limit greatest(1, least(coalesce(p_limit, 200), 2000));
end;
$$;
revoke execute on function public.list_work_logs(text, date, date, int) from public, anon;
grant  execute on function public.list_work_logs(text, date, date, int) to authenticated, service_role;

create or replace function public.get_work_log(p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v jsonb;
begin
  perform public.assert_owner();
  select jsonb_build_object(
    'log', to_jsonb(l),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'seq', i.seq, 'code', i.code, 'time_text', i.time_text,
                'hour_end', i.hour_end, 'title', i.title, 'project_slug', p.slug, 'project_name', p.name,
                'goal_code', g.code, 'goal_title', g.title, 'status', i.status, 'tags', i.tags, 'body_md', i.body_md) order by i.seq), '[]'::jsonb)
              from public.work_items i join public.projects p on p.id = i.project_id left join public.goals g on g.id = i.goal_id where i.log_id = l.id),
    'hours', (select coalesce(jsonb_agg(jsonb_build_object('hour', h.hour, 'value', h.value, 'label', h.label) order by h.hour), '[]'::jsonb) from public.work_hours h where h.log_id = l.id),
    'todos', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'text', t.text, 'needs_decision', t.needs_decision, 'done', t.done, 'plan_item_code', pi.code) order by t.seq), '[]'::jsonb)
              from public.log_todos t left join public.plan_items pi on pi.id = t.plan_item_id where t.log_id = l.id),
    'completions', (select coalesce(jsonb_agg(jsonb_build_object('code', pi.code, 'title', pi.title, 'goal_code', g.code) order by pi.code), '[]'::jsonb)
              from public.item_completions c join public.plan_items pi on pi.id = c.plan_item_id join public.goals g on g.id = pi.goal_id where c.log_id = l.id)
  ) into v from public.work_logs l where l.id = p_id;
  if v is null then raise exception '기록을 찾을 수 없습니다'; end if;
  return v;
end;
$$;
revoke execute on function public.get_work_log(uuid) from public, anon;
grant  execute on function public.get_work_log(uuid) to authenticated, service_role;

-- 삭제 — 이 기록이 완료 처리한 계획 항목은 되돌린다(다른 기록이 끝낸 것은 그대로)
create or replace function public.delete_work_log(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_owner();
  update public.plan_items set status = 'open', done_log_id = null where done_log_id = p_id;
  delete from public.work_logs where id = p_id;   -- items · hours · todos · completions cascade
end;
$$;
revoke execute on function public.delete_work_log(uuid) from public, anon;
grant  execute on function public.delete_work_log(uuid) to authenticated, service_role;

create or replace function public.set_log_todo_done(p_id uuid, p_done boolean)
returns public.log_todos
language plpgsql security definer set search_path = ''
as $$
declare v public.log_todos;
begin
  perform public.assert_owner();
  update public.log_todos set done = p_done where id = p_id returning * into v;
  if v.id is null then raise exception '할 일을 찾을 수 없습니다'; end if;
  return v;
end;
$$;
revoke execute on function public.set_log_todo_done(uuid, boolean) from public, anon;
grant  execute on function public.set_log_todo_done(uuid, boolean) to authenticated, service_role;
