-- ═══════════════════════════════════════════════════════════════════════════
-- 0021 calendar_todo_from_created — 시작일이 없는 할 일은 "등록한 날 ~ 기한" 으로 달력에 그린다 (2026-10-22 지시)
--   예: 목요일에 등록하고 금요일이 기한인 할 일은 목 · 금 두 칸을 잇는 줄. 0019 는 기한 하루만 그렸다.
--   등록한 날 = created_at 의 한국 날짜. 기한보다 늦게 등록한 경우(지난 기한을 나중에 적은 경우)는 기한 하루만.
-- ═══════════════════════════════════════════════════════════════════════════

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
               from public.work_logs l where l.log_date between cal_start and cal_end),
      -- 할 일: 기한이 있는 할 일은 전부 달력에 그린다. 시작 = 시작일, 없으면 등록한 날(한국 시간, 기한보다 늦으면 기한)(0021)
      'ranges', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'text', x.text, 'start', x.s, 'end', x.due_date, 'done', x.done,
                   'project_slug', x.slug, 'plan_item_code', x.pcode) order by x.s, x.due_date desc, x.created_at), '[]'::jsonb)
                 from (select t.id, t.text, t.due_date, t.done, t.created_at, p.slug, pi.code as pcode,
                              coalesce(t.start_date, least((t.created_at at time zone 'Asia/Seoul')::date, t.due_date)) as s
                         from public.log_todos t left join public.projects p on p.id = t.project_id left join public.plan_items pi on pi.id = t.plan_item_id
                        where t.due_date is not null) x
                 where x.s <= cal_end and x.due_date >= cal_start)),
    -- 할 일: 기록에서 온 것(최근 14일) + 화면에서 직접 추가한 것(log_id null, 기간 제한 없음). 0010
    'todos', (select coalesce(jsonb_agg(jsonb_build_object('kind', 'log', 'id', t.id, 'text', t.text, 'needs_decision', t.needs_decision, 'done', t.done,
                'source', l.code, 'log_id', t.log_id, 'plan_item_code', pi.code, 'project_slug', p.slug, 'goal_code', g.code, 'due_date', t.due_date, 'start_date', t.start_date, 'note', t.note)
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

