-- ═══════════════════════════════════════════════════════════════════════════
-- 0022 projects_page — 프로젝트 페이지(/projects). 프로젝트마다 소개 · 목표 글을 두고,
--   기록 · 목표 · 계획 항목 · 할 일을 프로젝트 축으로 모아 진행상황을 한 화면에 보여 준다 (docs/VOCAB.md §3 프로젝트).
--   - 컬럼 추가: intro_md(소개) · objective_md(목표 · 방향). 둘 다 마크다운, 선택.
--   - save_project: 화면 폼용 저장. 기존 upsert_project(MCP create_project 가 쓴다)는 그대로 두고 그 위에서 두 컬럼을 더 쓴다.
--   - project_overview: 목록용 집계(프로젝트별 목표 수 · 할 일 완료율 · 기록 수 · 투입 시간 · 마지막 기록일).
--   - get_project: 상세용 집계(목표 목록 · 최근 기록 · 미완 할 일 · 최근 8주 투입).
--   투입 시간은 0009 와 같은 근사 방식(작업이 끝난 시각의 시간표 값을 그 작업의 프로젝트에, 같은 시각이 여럿이면 n 으로 나눔).
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.projects
  add column if not exists intro_md     text,
  add column if not exists objective_md text;
comment on column public.projects.intro_md     is '프로젝트 소개(마크다운, 선택). 프로젝트 페이지에서 편집. 0022';
comment on column public.projects.objective_md is '프로젝트 목표 · 방향(마크다운, 선택). 프로젝트 페이지에서 편집. 0022';

-- ── 저장(화면 폼). 새로 만들 때는 slug 필수, 고칠 때는 slug 를 바꾸지 않는다(md 원문이 P-코드를 가리키므로) ──
create or replace function public.save_project(
  p_id uuid, p_slug text, p_name text, p_abbr text, p_description text, p_intro_md text, p_objective_md text, p_sort int
)
returns public.projects
language plpgsql security definer set search_path = ''
as $$
declare v public.projects; cur public.projects;
begin
  perform public.assert_owner();
  if p_id is null then
    v := public.upsert_project(null, p_slug, p_name, p_abbr, p_description, p_sort);
  else
    select * into cur from public.projects where id = p_id;
    if cur.id is null then raise exception '프로젝트를 찾을 수 없습니다'; end if;
    v := public.upsert_project(p_id, cur.slug, p_name, p_abbr, p_description, p_sort);
  end if;
  update public.projects set intro_md = nullif(btrim(p_intro_md), ''), objective_md = nullif(btrim(p_objective_md), '')
  where id = v.id returning * into v;
  return v;
end;
$$;
revoke execute on function public.save_project(uuid, text, text, text, text, text, text, int) from public, anon;
grant  execute on function public.save_project(uuid, text, text, text, text, text, text, int) to authenticated, service_role;

-- ── 프로젝트별 투입 시간(근사, 0009 방식). 기간을 주면 그 기간의 기록만 ──
create or replace function public.project_hours(p_from date default null, p_to date default null)
returns table (project_id uuid, hours numeric)
language sql stable security definer set search_path = ''
as $$
  select i.project_id, round(sum(h.value / c.n), 2) as hours
  from public.work_items i
  join public.work_logs l on l.id = i.log_id
  join public.work_hours h on h.log_id = l.id and h.hour = i.hour_end
  join (select log_id, hour_end, count(*)::numeric as n from public.work_items where hour_end is not null group by log_id, hour_end) c
    on c.log_id = i.log_id and c.hour_end = i.hour_end
  where (p_from is null or l.log_date >= p_from) and (p_to is null or l.log_date <= p_to)
  group by i.project_id
$$;
revoke execute on function public.project_hours(date, date) from public, anon;
grant  execute on function public.project_hours(date, date) to authenticated, service_role;

-- ── 목록용 집계. 보관(archived)까지 전부 돌려주고 화면이 거른다 ──
create or replace function public.project_overview()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare d date := (now() at time zone 'Asia/Seoul')::date;
begin
  perform public.assert_owner();
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'slug', p.slug, 'name', p.name, 'abbr', p.abbr, 'description', p.description,
      'intro_md', p.intro_md, 'objective_md', p.objective_md, 'status', p.status, 'sort', p.sort,
      'goals_total',  (select count(*) from public.goals g where g.project_id = p.id),
      'goals_active', (select count(*) from public.goals g where g.project_id = p.id and g.status = 'active'),
      'goals_done',   (select count(*) from public.goals g where g.project_id = p.id and g.status = 'done'),
      'items_total',  (select count(*) from public.plan_items i join public.goals g on g.id = i.goal_id where g.project_id = p.id),
      'items_done',   (select count(*) from public.plan_items i join public.goals g on g.id = i.goal_id where g.project_id = p.id and i.status = 'done'),
      'logs_count',   (select count(distinct i.log_id) from public.work_items i where i.project_id = p.id),
      'tasks_count',  (select count(*) from public.work_items i where i.project_id = p.id),
      'hours_total',  coalesce((select hours from public.project_hours() ph where ph.project_id = p.id), 0),
      'hours_28d',    coalesce((select hours from public.project_hours(d - 27, d) ph where ph.project_id = p.id), 0),
      'last_log_date', (select max(l.log_date) from public.work_items i join public.work_logs l on l.id = i.log_id where i.project_id = p.id),
      'open_todos',   (select count(*) from public.log_todos t where not t.done and t.project_id = p.id)
    ) order by p.sort, p.name), '[]'::jsonb)
    from public.projects p
  );
end;
$$;
revoke execute on function public.project_overview() from public, anon;
grant  execute on function public.project_overview() to authenticated, service_role;

-- ── 상세용 집계 ──
create or replace function public.get_project(p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare d date := (now() at time zone 'Asia/Seoul')::date; wk_start date;
begin
  perform public.assert_owner();
  wk_start := d - ((extract(isodow from d))::int - 1);
  return (
    select jsonb_build_object(
      'project', to_jsonb(p),
      'goals', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', g.id, 'code', g.code, 'title', g.title, 'status', g.status,
                  'period_start', g.period_start, 'period_end', g.period_end, 'note', g.note,
                  'item_count', (select count(*) from public.plan_items i where i.goal_id = g.id),
                  'done_count', (select count(*) from public.plan_items i where i.goal_id = g.id and i.status = 'done')
                ) order by (g.status = 'active') desc, g.code), '[]'::jsonb)
                from public.goals g where g.project_id = p.id),
      'open_items', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', i.id, 'code', i.code, 'title', i.title, 'due_date', i.due_date, 'goal_code', g.code, 'plan_code', pl.code
                ) order by i.due_date nulls last, i.code), '[]'::jsonb)
                from public.plan_items i join public.goals g on g.id = i.goal_id join public.plans pl on pl.id = i.plan_id
                where g.project_id = p.id and i.status = 'open'),
      'open_todos', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', t.id, 'text', t.text, 'needs_decision', t.needs_decision, 'due_date', t.due_date,
                  'source', l.code, 'log_id', l.id
                ) order by t.due_date nulls last, t.created_at desc), '[]'::jsonb)
                from public.log_todos t left join public.work_logs l on l.id = t.log_id
                where not t.done and t.project_id = p.id),
      'recent_logs', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', x.id, 'code', x.code, 'log_date', x.log_date, 'summary', x.summary, 'task_count', x.n, 'done_count', x.dn
                ) order by x.log_date desc, x.created_at desc), '[]'::jsonb)
                from (select l.id, l.code, l.log_date, l.summary, l.created_at,
                             count(*) as n, count(*) filter (where i.status = '완료') as dn
                      from public.work_items i join public.work_logs l on l.id = i.log_id
                      where i.project_id = p.id group by l.id order by l.log_date desc, l.created_at desc limit 12) x),
      'weeks', (select coalesce(jsonb_agg(jsonb_build_object(
                  'week_start', w.ws, 'hours', coalesce((select hours from public.project_hours(w.ws, w.ws + 6) ph where ph.project_id = p.id), 0)
                ) order by w.ws), '[]'::jsonb)
                from (select (wk_start - 7 * k)::date as ws from generate_series(7, 0, -1) as k) w),
      'hours_total', coalesce((select hours from public.project_hours() ph where ph.project_id = p.id), 0),
      'logs_count', (select count(distinct i.log_id) from public.work_items i where i.project_id = p.id),
      'tasks_count', (select count(*) from public.work_items i where i.project_id = p.id)
    )
    from public.projects p where p.id = p_id
  );
end;
$$;
revoke execute on function public.get_project(uuid) from public, anon;
grant  execute on function public.get_project(uuid) to authenticated, service_role;
