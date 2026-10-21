-- ═══════════════════════════════════════════════════════════════════════════
-- 0010 todos_standalone — 「앞으로 할 일」을 화면에서 직접 추가 · 수정 · 삭제 (2026-10-21 지시)
--   log_todos 는 지금까지 기록 md 에서만 생겼다. log_id 를 선택으로 풀어 화면에서 만든 할 일도 같은 표에 둔다.
--   프로젝트 · 목표 · 계획 항목 · 기한 · 메모를 선택으로 붙인다(연결은 코드로만, VOCAB §2). 기록에서 온 할 일도 같은 폼으로 고친다.
--   home_stats · context_pack 을 다시 정의해 직접 추가한 할 일을 함께 낸다.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.log_todos alter column log_id drop not null;
alter table public.log_todos alter column seq set default 0;
alter table public.log_todos
  add column project_id uuid references public.projects (id),
  add column goal_id    uuid references public.goals (id),
  add column due_date   date,
  add column note       text;
create index log_todos_open_idx on public.log_todos (done, due_date);
comment on table public.log_todos is '앞으로 할 일. 기록 md 의 「앞으로 할 일」 줄(log_id 있음) 또는 화면에서 직접 추가(log_id 없음). 프로젝트 · 목표 · 계획 항목 · 기한은 선택. 0005 · 0010';

create or replace function public.upsert_todo(
  p_id uuid, p_text text, p_needs_decision boolean, p_project_slug text, p_goal_code text, p_plan_item_code text,
  p_due_date date, p_note text, p_done boolean
)
returns public.log_todos
language plpgsql security definer set search_path = ''
as $$
declare v public.log_todos; v_project uuid; v_goal uuid; v_pi uuid;
begin
  perform public.assert_owner();
  if nullif(btrim(p_text), '') is null then raise exception '할 일 내용은 비울 수 없습니다'; end if;
  if nullif(btrim(p_project_slug), '') is not null then
    select id into v_project from public.projects where slug = upper(btrim(p_project_slug));
    if v_project is null then raise exception '프로젝트 코드를 찾을 수 없습니다: P-%', p_project_slug; end if;
  end if;
  if nullif(btrim(p_goal_code), '') is not null then
    select id into v_goal from public.goals where code = upper(btrim(p_goal_code));
    if v_goal is null then raise exception '목표 코드를 찾을 수 없습니다: %', p_goal_code; end if;
  end if;
  if nullif(btrim(p_plan_item_code), '') is not null then
    select id into v_pi from public.plan_items where code = upper(btrim(p_plan_item_code));
    if v_pi is null then raise exception '계획 항목 코드를 찾을 수 없습니다: %', p_plan_item_code; end if;
  end if;
  if p_id is null then
    insert into public.log_todos (text, needs_decision, project_id, goal_id, plan_item_id, due_date, note, done)
    values (btrim(p_text), coalesce(p_needs_decision, false), v_project, v_goal, v_pi, p_due_date, nullif(btrim(p_note), ''), coalesce(p_done, false))
    returning * into v;
  else
    update public.log_todos set text = btrim(p_text), needs_decision = coalesce(p_needs_decision, needs_decision), project_id = v_project,
      goal_id = v_goal, plan_item_id = v_pi, due_date = p_due_date, note = nullif(btrim(p_note), ''), done = coalesce(p_done, done)
    where id = p_id returning * into v;
    if v.id is null then raise exception '할 일을 찾을 수 없습니다'; end if;
  end if;
  return v;
end;
$$;
revoke execute on function public.upsert_todo(uuid, text, boolean, text, text, text, date, text, boolean) from public, anon;
grant  execute on function public.upsert_todo(uuid, text, boolean, text, text, text, date, text, boolean) to authenticated, service_role;

create or replace function public.delete_todo(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_owner();
  delete from public.log_todos where id = p_id;
end;
$$;
revoke execute on function public.delete_todo(uuid) from public, anon;
grant  execute on function public.delete_todo(uuid) to authenticated, service_role;

-- ── context_pack 재정의(0007 본문 + 직접 추가한 할 일) ──
create or replace function public.context_pack(p_from date default null, p_to date default null)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare out text; r record; pr record; ir record; v_from date := coalesce(p_from, current_date - 7); v_to date := coalesce(p_to, current_date);
begin
  perform public.assert_owner();
  out := '# WORK LOG 컨텍스트 · ' || to_char(current_date, 'YYYY-MM-DD') || ' 기준' || E'\n';
  out := out || '## 프로젝트 (P-코드 이름 (약칭))' || E'\n';
  for r in select slug, name, abbr from public.projects where status = 'active' order by sort loop
    out := out || 'P-' || r.slug || ' ' || r.name || ' (' || r.abbr || ')' || E'\n';
  end loop;
  out := out || E'\n## 진행 중 목표 (코드 제목 · 프로젝트 · 기간 · 완료/할 일)\n';
  for r in select g.code, g.title, p.slug, g.period_start, g.period_end,
                  (select count(*) from public.plan_items i where i.goal_id = g.id) as n,
                  (select count(*) from public.plan_items i where i.goal_id = g.id and i.status = 'done') as d
           from public.goals g join public.projects p on p.id = g.project_id where g.status = 'active' order by g.code loop
    out := out || r.code || ' ' || r.title || ' · P-' || r.slug || ' · ' || coalesce(to_char(r.period_start, 'MM-DD'), '?') || '~' || coalesce(to_char(r.period_end, 'MM-DD'), '?') || ' · ' || r.d || '/' || r.n || E'\n';
  end loop;
  for pr in select pl.id, pl.code, pl.period_start, pl.period_end from public.plans pl where pl.status = 'active' and pl.period_end >= current_date order by pl.period_start loop
    out := out || E'\n## 계획 ' || pr.code || ' (' || to_char(pr.period_start, 'MM-DD') || ' ~ ' || to_char(pr.period_end, 'MM-DD') || E') 할 일 (코드 제목 · 기한 · 상태)\n';
    for ir in select i.code, i.title, i.due_date, i.status from public.plan_items i where i.plan_id = pr.id order by i.code loop
      out := out || ir.code || ' ' || ir.title || ' · ' || coalesce(to_char(ir.due_date, 'MM-DD'), '기한 없음') || ' · ' || case ir.status when 'done' then '완료' else '미완' end || E'\n';
    end loop;
  end loop;
  out := out || E'\n## 최근 기록 ' || to_char(v_from, 'MM-DD') || ' ~ ' || to_char(v_to, 'MM-DD') || E' (코드 · 작업 수 · 투입 · 요약)\n';
  for r in select code, task_count, hours_total, summary from public.work_logs where log_date between v_from and v_to order by log_date desc, created_at desc loop
    out := out || r.code || ' · ' || r.task_count || '작업 · ' || r.hours_total || '시간 · ' || coalesce(r.summary, '') || E'\n';
  end loop;
  out := out || E'\n## 미완 할 일 (기록에서)\n';
  for r in select t.text, t.needs_decision, coalesce(l.code, '직접 추가') as code, t.due_date, p.slug as pslug
           from public.log_todos t left join public.work_logs l on l.id = t.log_id left join public.projects p on p.id = t.project_id
           where not t.done and (t.log_id is null or l.log_date between v_from and v_to) order by l.log_date desc nulls first, t.seq, t.created_at loop
    out := out || '- ' || case when r.needs_decision then '판단 필요: ' else '' end || r.text
        || case when r.pslug is not null then ' · P-' || r.pslug else '' end
        || case when r.due_date is not null then ' · ' || to_char(r.due_date, 'MM-DD') else '' end
        || ' (' || r.code || ')' || E'\n';
  end loop;
  out := out || E'\n이 목록에 없는 코드는 존재하지 않는다. 새 목표가 필요하면 [신규] 로 표시한다.\n';
  return out;
end;
$$;
revoke execute on function public.context_pack(date, date) from public, anon;
grant  execute on function public.context_pack(date, date) to authenticated, service_role;


-- ── home_stats 재정의(0009 본문 + 할 일 확장) ──
create or replace function public.home_stats(p_date date default null)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare d date := coalesce(p_date, current_date); wk_start date; wk_end date; mo_start date; mo_end date; cal_start date; cal_end date;
begin
  perform public.assert_owner();
  wk_start := d - ((extract(isodow from d))::int - 1); wk_end := wk_start + 6;
  mo_start := date_trunc('month', d)::date; mo_end := (mo_start + interval '1 month - 1 day')::date;
  cal_start := mo_start - ((extract(isodow from mo_start))::int - 1); cal_end := cal_start + 41;
  return jsonb_build_object(
    'date', d,
    'today_hours', (select coalesce(jsonb_agg(jsonb_build_object('hour', h.hour, 'value', h.value) order by h.hour), '[]'::jsonb)
                    from public.work_hours h join public.work_logs l on l.id = h.log_id where l.log_date = d),
    'week_days', (select coalesce(jsonb_agg(jsonb_build_object('date', x.day, 'hours', coalesce((select sum(hours_total) from public.work_logs l where l.log_date = x.day), 0)) order by x.day), '[]'::jsonb)
                  from generate_series(wk_start, wk_end, '1 day') as x(day)),
    'month_days', (select coalesce(jsonb_agg(jsonb_build_object('date', x.day, 'hours', coalesce((select sum(hours_total) from public.work_logs l where l.log_date = x.day), 0)) order by x.day), '[]'::jsonb)
                   from generate_series(mo_start, mo_end, '1 day') as x(day)),
    -- 프로젝트별 투입(근사): 작업이 끝난 시각의 투입을 그 작업의 프로젝트에 준다. 같은 시각에 끝난 작업이 여럿이면 n 으로 나눠
    -- 합이 주간 총투입을 넘지 않게 한다(0009). 작업이 끝나지 않은 시각의 투입은 어느 프로젝트에도 붙지 않는다.
    'week_projects', (select coalesce(jsonb_agg(jsonb_build_object('slug', s.slug, 'name', s.name, 'hours', s.h) order by s.h desc), '[]'::jsonb)
                      from (select p.slug, p.name, round(sum(h.value / c.n), 2) as h
                            from public.work_items i join public.projects p on p.id = i.project_id
                            join public.work_logs l on l.id = i.log_id
                            join public.work_hours h on h.log_id = l.id and h.hour = i.hour_end
                            join (select log_id, hour_end, count(*)::numeric as n from public.work_items where hour_end is not null group by log_id, hour_end) c
                              on c.log_id = i.log_id and c.hour_end = i.hour_end
                            where l.log_date between wk_start and wk_end group by p.slug, p.name) s),
    'calendar', jsonb_build_object('start', cal_start, 'end', cal_end,
      'planned', (select coalesce(jsonb_agg(jsonb_build_object('date', i.due_date, 'code', i.code, 'title', i.title, 'status', i.status, 'goal_code', g.code) order by i.due_date, i.code), '[]'::jsonb)
                  from public.plan_items i join public.goals g on g.id = i.goal_id where i.due_date between cal_start and cal_end),
      'logs', (select coalesce(jsonb_agg(jsonb_build_object('date', l.log_date, 'id', l.id, 'code', l.code, 'hours', l.hours_total,
                 'projects', (select coalesce(array_agg(distinct p.slug), '{}') from public.work_items i join public.projects p on p.id = i.project_id where i.log_id = l.id)) order by l.log_date), '[]'::jsonb)
               from public.work_logs l where l.log_date between cal_start and cal_end)),
    -- 할 일: 기록에서 온 것(최근 14일) + 화면에서 직접 추가한 것(log_id null, 기간 제한 없음). 0010
    'todos', (select coalesce(jsonb_agg(jsonb_build_object('kind', 'log', 'id', t.id, 'text', t.text, 'needs_decision', t.needs_decision, 'done', t.done,
                'source', l.code, 'log_id', t.log_id, 'plan_item_code', pi.code, 'project_slug', p.slug, 'goal_code', g.code, 'due_date', t.due_date, 'note', t.note)
                order by (t.log_id is null) desc, l.log_date desc, t.seq, t.created_at desc), '[]'::jsonb)
              from public.log_todos t left join public.work_logs l on l.id = t.log_id left join public.plan_items pi on pi.id = t.plan_item_id
              left join public.projects p on p.id = t.project_id left join public.goals g on g.id = t.goal_id
              where t.log_id is null or l.log_date >= d - 14),
    'plan_items_open', (select coalesce(jsonb_agg(jsonb_build_object('kind', 'plan', 'id', i.id, 'code', i.code, 'text', i.title, 'done', i.status = 'done', 'due_date', i.due_date, 'source', pl.code) order by i.due_date nulls last, i.code), '[]'::jsonb)
              from public.plan_items i join public.plans pl on pl.id = i.plan_id where pl.status = 'active' and pl.period_end >= d - 7),
    'active_plan', (select jsonb_build_object('id', pl.id, 'code', pl.code, 'title', pl.title, 'period_start', pl.period_start, 'period_end', pl.period_end,
                      'goals', (select coalesce(jsonb_agg(jsonb_build_object('code', g.code, 'title', g.title, 'project_slug', p.slug,
                                  'total', (select count(*) from public.plan_items i where i.goal_id = g.id and i.plan_id = pl.id),
                                  'done', (select count(*) from public.plan_items i where i.goal_id = g.id and i.plan_id = pl.id and i.status = 'done')) order by g.code), '[]'::jsonb)
                                from public.goals g join public.projects p on p.id = g.project_id
                                where g.id in (select goal_id from public.plan_items where plan_id = pl.id)))
                    from public.plans pl where pl.status = 'active' and d between pl.period_start and pl.period_end
                    order by pl.period_end - pl.period_start asc, pl.period_start desc limit 1)
  );
end;
$$;
revoke execute on function public.home_stats(date) from public, anon;
grant  execute on function public.home_stats(date) to authenticated, service_role;
