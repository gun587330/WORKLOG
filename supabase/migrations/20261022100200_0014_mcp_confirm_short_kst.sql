-- ═══════════════════════════════════════════════════════════════════════════
-- 0014 mcp_confirm_short_kst — 두 가지 수정 (2026-10-22 MCP 로컬 검증에서 발견)
--   ① mcp_commit: 사용자 답변이 "네" 한 글자면 "답변 없음" 으로 거절하던 것 → 빈 값만 거절
--   ② context_pack: "오늘" 을 DB 기본 시간대(UTC)로 잡아 한국 아침에는 어제 날짜가 찍히던 것 → Asia/Seoul 기준
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.context_pack(p_from date default null, p_to date default null)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare out text; r record; pr record; ir record; v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_from date := coalesce(p_from, v_today - 7); v_to date := coalesce(p_to, v_today);
begin
  perform public.assert_owner();
  out := '# WORK LOG 컨텍스트 · ' || to_char(v_today, 'YYYY-MM-DD') || ' 기준 (한국 시간)' || E'\n';
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
  for pr in select pl.id, pl.code, pl.period_start, pl.period_end from public.plans pl where pl.status = 'active' and pl.period_end >= v_today order by pl.period_start loop
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
        nullif(p->>'due_date', '')::date, p->>'note', (p->>'done')::boolean) x;
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

