-- ═══════════════════════════════════════════════════════════════════════════
-- 0018 todo_start_date — 할 일에 시작일. 시작일 ~ 기한이 있는 할 일은 홈 달력에 여러 날을 잇는 줄로 그린다(애플 캘린더처럼)
--   upsert_todo 에 p_start_date(마지막, 기본 null)를 더한다. 인자 수가 바뀌므로 옛 함수를 지우고 다시 만든다.
--   home_stats(calendar.ranges · todos.start_date), get_work_log(todos.start_date), mcp_commit(save_todo 시작일) 을 다시 정의한다.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.log_todos add column start_date date;
alter table public.log_todos add constraint log_todos_range_check check (start_date is null or (due_date is not null and start_date <= due_date));
comment on column public.log_todos.start_date is '시작일(선택). 기한과 함께 있으면 달력에 기간 줄로 그린다. 0018';

drop function public.upsert_todo(uuid, text, boolean, text, text, text, date, text, boolean);
create or replace function public.upsert_todo(
  p_id uuid, p_text text, p_needs_decision boolean, p_project_slug text, p_goal_code text, p_plan_item_code text,
  p_due_date date, p_note text, p_done boolean, p_start_date date default null
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
  if p_start_date is not null and p_due_date is null then raise exception '시작일을 쓰려면 기한(끝나는 날)도 정해 주세요'; end if;
  if p_start_date is not null and p_start_date > p_due_date then raise exception '시작일이 기한보다 늦습니다'; end if;
  if p_id is null then
    insert into public.log_todos (text, needs_decision, project_id, goal_id, plan_item_id, start_date, due_date, note, done)
    values (btrim(p_text), coalesce(p_needs_decision, false), v_project, v_goal, v_pi, p_start_date, p_due_date, nullif(btrim(p_note), ''), coalesce(p_done, false))
    returning * into v;
  else
    update public.log_todos set text = btrim(p_text), needs_decision = coalesce(p_needs_decision, needs_decision), project_id = v_project,
      goal_id = v_goal, plan_item_id = v_pi, start_date = p_start_date, due_date = p_due_date, note = nullif(btrim(p_note), ''), done = coalesce(p_done, done)
    where id = p_id returning * into v;
    if v.id is null then raise exception '할 일을 찾을 수 없습니다'; end if;
  end if;
  return v;
end;
$$;
revoke execute on function public.upsert_todo(uuid, text, boolean, text, text, text, date, text, boolean, date) from public, anon;
grant  execute on function public.upsert_todo(uuid, text, boolean, text, text, text, date, text, boolean, date) to authenticated, service_role;


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
      -- 기간 할 일(시작일 ~ 기한): 달력에 여러 날을 잇는 줄로 그린다(0018)
      'ranges', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'text', t.text, 'start', t.start_date, 'end', t.due_date, 'done', t.done,
                   'project_slug', p.slug, 'plan_item_code', pi.code) order by t.start_date, t.due_date desc, t.created_at), '[]'::jsonb)
                 from public.log_todos t left join public.projects p on p.id = t.project_id left join public.plan_items pi on pi.id = t.plan_item_id
                 where t.start_date is not null and t.due_date is not null and t.start_date <= cal_end and t.due_date >= cal_start)),
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
    -- 할 일: 홈과 같은 폼으로 고칠 수 있게 프로젝트 · 목표 · 기한 · 메모까지 낸다(0011)
    'todos', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'text', t.text, 'needs_decision', t.needs_decision, 'done', t.done,
                'plan_item_code', pi.code, 'project_slug', p.slug, 'goal_code', g.code, 'due_date', t.due_date, 'start_date', t.start_date, 'note', t.note, 'log_id', t.log_id) order by t.seq, t.created_at), '[]'::jsonb)
              from public.log_todos t left join public.plan_items pi on pi.id = t.plan_item_id
              left join public.projects p on p.id = t.project_id left join public.goals g on g.id = t.goal_id where t.log_id = l.id),
    'completions', (select coalesce(jsonb_agg(jsonb_build_object('code', pi.code, 'title', pi.title, 'goal_code', g.code) order by pi.code), '[]'::jsonb)
              from public.item_completions c join public.plan_items pi on pi.id = c.plan_item_id join public.goals g on g.id = pi.goal_id where c.log_id = l.id)
  ) into v from public.work_logs l where l.id = p_id;
  if v is null then raise exception '기록을 찾을 수 없습니다'; end if;
  return v;
end;
$$;
revoke execute on function public.get_work_log(uuid) from public, anon;
grant  execute on function public.get_work_log(uuid) to authenticated, service_role;


-- ── 쓰기 2단계: 확인이 갖춰졌을 때만 저장 ─────────────────────────────────────
create or replace function public.mcp_commit(
  p_token text, p_tool text, p_code text, p_user_confirmation text, p_confirmations jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare t private.mcp_tokens; pd private.mcp_pending; p jsonb; c jsonb := coalesce(p_confirmations, '[]'::jsonb); r jsonb; v_id uuid;
begin
  t := private.mcp_auth(p_token);
  if btrim(coalesce(p_user_confirmation, '')) = '' then
    raise exception '사용자 확인 답변 원문(user_confirmation)이 없습니다. 사용자에게 preview 를 보여 주고 승인 답변을 받은 뒤 그 답변을 그대로 넣어 주세요';
  end if;
  select * into pd from private.mcp_pending where code = upper(btrim(coalesce(p_code, ''))) for update;
  if pd.code is null then raise exception '확인 번호가 없습니다. mode=preview 부터 다시 해 주세요'; end if;
  if pd.used_at is not null then raise exception '이미 쓴 확인 번호입니다. 다시 저장하려면 preview 부터 다시 해 주세요'; end if;
  if pd.expires_at < now() then raise exception '확인 번호가 만료됐습니다(15분). preview 부터 다시 해 주세요'; end if;
  if pd.token_id <> t.id or pd.tool <> p_tool then raise exception '이 확인 번호는 다른 도구 또는 다른 토큰의 것입니다'; end if;
  update private.mcp_pending set used_at = now() where code = pd.code;
  p := pd.payload;

  case p_tool
    when 'upload_log' then
      if exists (
        select 1 from jsonb_array_elements(p->'items') it
         where not exists (
           select 1 from jsonb_array_elements(c) cf
            where jsonb_typeof(cf) = 'object' and (cf->>'seq')::int = (it->>'seq')::int
              and private.mcp_slug(cf->>'project_code') = upper(it->>'project_slug')
              and coalesce((cf->>'confirmed')::boolean, false))) then
        raise exception '작업마다 사용자가 확인한 프로젝트가 필요합니다(project_confirmations: [{seq, project_code, confirmed: true}]). 확인받지 않았거나 코드가 다른 작업이 있습니다';
      end if;
      select to_jsonb(x) into r from public.insert_work_log(
        (p->>'log_date')::date, p->>'author_name', p->>'summary', p->>'raw_md', p->'items', p->'hours', p->'todos',
        coalesce((select array_agg(value) from jsonb_array_elements_text(coalesce(p->'completions', '[]'::jsonb))), '{}'::text[])) x;
      perform public.insert_links('log', (r->>'id')::uuid, coalesce(p->'links', '[]'::jsonb));
      r := jsonb_build_object('code', r->'code', 'tasks', r->'task_count', 'hours', r->'hours_total');

    when 'upload_plan' then
      if exists (
        select 1 from jsonb_array_elements(p->'goals') g
         where coalesce((g->>'is_new')::boolean, false) and not exists (
           select 1 from jsonb_array_elements(c) cf
            where jsonb_typeof(cf) = 'object' and upper(cf->>'ref') = upper(g->>'ref')
              and private.mcp_slug(cf->>'project_code') = upper(g->>'project_slug')
              and coalesce((cf->>'confirmed')::boolean, false))) then
        raise exception '[신규] 목표마다 사용자가 확인한 프로젝트가 필요합니다(new_goal_confirmations: [{ref, project_code, confirmed: true}])';
      end if;
      select to_jsonb(x) into r from public.insert_plan(
        p->>'code', p->>'title', (p->>'period_start')::date, (p->>'period_end')::date, p->>'summary', p->>'raw_md', p->'goals', p->'items') x;
      perform public.insert_links('plan', (r->>'id')::uuid, coalesce(p->'links', '[]'::jsonb));
      r := jsonb_build_object('code', r->'code', 'title', r->'title',
             'items', (select coalesce(jsonb_agg(i.code order by i.code), '[]'::jsonb) from public.plan_items i where i.plan_id = (r->>'id')::uuid));

    when 'create_project' then
      if not (pd.candidates <@ coalesce((select array_agg(private.mcp_slug(value)) from jsonb_array_elements_text(
                                            case when jsonb_typeof(c) = 'array' then c else '[]'::jsonb end)), '{}'::text[])) then
        raise exception 'preview 가 보여 준 기존 프로젝트 전부를 사용자와 검토했다는 표시(reviewed_projects)가 필요합니다';
      end if;
      if exists (select 1 from public.projects where slug = private.mcp_slug(p->>'slug') or private.mcp_norm(name) = private.mcp_norm(p->>'name')) then
        raise exception '이미 있는 프로젝트와 같습니다. 새로 만들지 않습니다';
      end if;
      select to_jsonb(x) into r from public.upsert_project(null, private.mcp_slug(p->>'slug'), p->>'name', p->>'abbr', p->>'description',
                                                          coalesce((p->>'sort')::int, 100)) x;
      r := jsonb_build_object('code', 'P-' || (r->>'slug'), 'name', r->'name');

    when 'save_goal' then
      if not exists (select 1 from jsonb_array_elements(c) cf where jsonb_typeof(cf) = 'object'
                      and private.mcp_slug(cf->>'project_code') = private.mcp_slug(p->>'project_slug') and coalesce((cf->>'confirmed')::boolean, false)) then
        raise exception '목표의 프로젝트를 사용자에게 확인받아야 합니다(project_code + project_confirmed: true)';
      end if;
      v_id := null;
      if nullif(p->>'code', '') is not null then
        select id into v_id from public.goals where code = upper(btrim(p->>'code'));
        if v_id is null then raise exception '목표 코드를 찾을 수 없습니다: %', p->>'code'; end if;
      end if;
      select to_jsonb(x) into r from public.upsert_goal(v_id, p->>'title', private.mcp_slug(p->>'project_slug'),
        nullif(p->>'period_start', '')::date, nullif(p->>'period_end', '')::date, nullif(p->>'status', ''), p->>'note') x;
      r := jsonb_build_object('code', r->'code', 'title', r->'title');

    when 'save_todo' then
      if nullif(p->>'project_slug', '') is not null and not exists (
           select 1 from jsonb_array_elements(c) cf where jsonb_typeof(cf) = 'object'
              and private.mcp_slug(cf->>'project_code') = private.mcp_slug(p->>'project_slug') and coalesce((cf->>'confirmed')::boolean, false)) then
        raise exception '할 일의 프로젝트를 사용자에게 확인받아야 합니다(project_code + project_confirmed: true)';
      end if;
      select to_jsonb(x) into r from public.upsert_todo(nullif(p->>'id', '')::uuid, p->>'text', coalesce((p->>'needs_decision')::boolean, false),
        nullif(private.mcp_slug(p->>'project_slug'), ''), nullif(p->>'goal_code', ''), nullif(p->>'plan_item_code', ''),
        nullif(p->>'due_date', '')::date, p->>'note', (p->>'done')::boolean, nullif(p->>'start_date', '')::date) x;
      r := jsonb_build_object('id', r->'id', 'text', r->'text', 'done', r->'done');

    when 'set_todo_done' then
      select to_jsonb(x) into r from public.set_log_todo_done((p->>'id')::uuid, (p->>'done')::boolean) x;
      r := jsonb_build_object('id', r->'id', 'text', r->'text', 'done', r->'done');

    when 'set_plan_item_status' then
      select id into v_id from public.plan_items where code = upper(btrim(p->>'code'));
      if v_id is null then raise exception '계획 항목 코드를 찾을 수 없습니다: %', p->>'code'; end if;
      select to_jsonb(x) into r from public.set_plan_item_status(v_id, p->>'status') x;
      r := jsonb_build_object('code', r->'code', 'status', r->'status');

    else
      raise exception '알 수 없는 쓰기 도구: %', p_tool;
  end case;

  insert into public.mcp_audit (tool, token_label, payload, confirmations, user_confirmation, result)
  values (p_tool, t.label, p, c, btrim(p_user_confirmation), r);
  return jsonb_build_object('saved', true, 'result', r);
end;
$$;
revoke execute on function public.mcp_commit(text, text, text, text, jsonb) from public;
grant  execute on function public.mcp_commit(text, text, text, text, jsonb) to anon, authenticated, service_role;

