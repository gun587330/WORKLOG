-- ═══════════════════════════════════════════════════════════════════════════
-- 0007 links_context — 링크(본문 [[코드]] 참조) + 컨텍스트 팩 + 홈 집계 (docs/VOCAB.md §3 · §5)
--   links 는 1차에 저장만 한다(3차 역링크 · 그래프 UI 때 과거를 다시 파싱하지 않기 위해).
--   context_pack 은 "이번 주 컨텍스트 복사" 와 2차 MCP get_context_pack 이 같이 쓴다.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.links (
  id         uuid primary key default gen_random_uuid(),
  from_type  text not null check (from_type in ('log', 'item', 'plan', 'plan_item', 'goal')),
  from_id    uuid not null,
  to_type    text not null check (to_type in ('project', 'goal', 'plan', 'plan_item', 'log')),
  to_code    text not null,                         -- 가리킨 코드 원문 (P-ANSERX · G12 · L-2026-10-19 …)
  kind       text not null default 'wikilink' check (kind in ('ref', 'wikilink')),
  context    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (from_type, from_id, to_type, to_code, kind)
);
alter table public.links enable row level security;
create trigger links_set_updated_at before update on public.links for each row execute function public.set_updated_at();
create index links_to_idx on public.links (to_type, to_code);
comment on table public.links is '본문 [[코드]] · 메타 참조로 생긴 개체 간 링크. 업로드 시 파서가 저장. 3차에서 역링크 UI. 0007';

create or replace function public.insert_links(p_from_type text, p_from_id uuid, p_links jsonb)
returns int
language plpgsql security definer set search_path = ''
as $$
declare l jsonb; n int := 0;
begin
  perform public.assert_owner();
  for l in select * from jsonb_array_elements(coalesce(p_links, '[]'::jsonb)) loop
    insert into public.links (from_type, from_id, to_type, to_code, kind, context)
    values (p_from_type, p_from_id, l->>'to_type', upper(l->>'to_code'), coalesce(l->>'kind', 'wikilink'), l->>'context')
    on conflict do nothing;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function public.insert_links(text, uuid, jsonb) from public, anon;
grant  execute on function public.insert_links(text, uuid, jsonb) to authenticated, service_role;

-- ── 컨텍스트 팩 — AI 에게 넘기는 현재 상태 (VOCAB §5). 코드가 맨 앞, 한 항목 한 줄 ──
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
  for r in select t.text, t.needs_decision, l.code from public.log_todos t join public.work_logs l on l.id = t.log_id
           where not t.done and l.log_date between v_from and v_to order by l.log_date desc, t.seq loop
    out := out || '- ' || case when r.needs_decision then '판단 필요: ' else '' end || r.text || ' (' || r.code || ')' || E'\n';
  end loop;
  out := out || E'\n이 목록에 없는 코드는 존재하지 않는다. 새 목표가 필요하면 [신규] 로 표시한다.\n';
  return out;
end;
$$;
revoke execute on function public.context_pack(date, date) from public, anon;
grant  execute on function public.context_pack(date, date) to authenticated, service_role;

-- ── 홈 집계 — 한 번에 받는다(작업량 3종 · 프로젝트별 주간 투입 · 달력 · 할 일 · 진행 중 계획) ──
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
    'week_projects', (select coalesce(jsonb_agg(jsonb_build_object('slug', s.slug, 'name', s.name, 'hours', s.h) order by s.h desc), '[]'::jsonb)
                      from (select p.slug, p.name, sum(h.value) as h
                            from public.work_items i join public.projects p on p.id = i.project_id
                            join public.work_logs l on l.id = i.log_id
                            join public.work_hours h on h.log_id = l.id and h.hour = i.hour_end
                            where l.log_date between wk_start and wk_end group by p.slug, p.name) s),
    'calendar', jsonb_build_object('start', cal_start, 'end', cal_end,
      'planned', (select coalesce(jsonb_agg(jsonb_build_object('date', i.due_date, 'code', i.code, 'title', i.title, 'status', i.status, 'goal_code', g.code) order by i.due_date, i.code), '[]'::jsonb)
                  from public.plan_items i join public.goals g on g.id = i.goal_id where i.due_date between cal_start and cal_end),
      'logs', (select coalesce(jsonb_agg(jsonb_build_object('date', l.log_date, 'id', l.id, 'code', l.code, 'hours', l.hours_total,
                 'projects', (select coalesce(array_agg(distinct p.slug), '{}') from public.work_items i join public.projects p on p.id = i.project_id where i.log_id = l.id)) order by l.log_date), '[]'::jsonb)
               from public.work_logs l where l.log_date between cal_start and cal_end)),
    'todos', (select coalesce(jsonb_agg(jsonb_build_object('kind', 'log', 'id', t.id, 'text', t.text, 'needs_decision', t.needs_decision, 'done', t.done, 'source', l.code, 'plan_item_code', pi.code) order by l.log_date desc, t.seq), '[]'::jsonb)
              from public.log_todos t join public.work_logs l on l.id = t.log_id left join public.plan_items pi on pi.id = t.plan_item_id
              where l.log_date >= d - 14),
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
