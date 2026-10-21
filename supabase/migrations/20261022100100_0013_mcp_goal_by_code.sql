-- ═══════════════════════════════════════════════════════════════════════════
-- 0013 mcp_goal_by_code — MCP save_goal 이 목표를 id 가 아니라 코드(G12)로 가리키게 한다
--   AI 에게 uuid 를 다루게 하지 않기 위함(코드가 사람과 AI 의 공통 언어, VOCAB §2). mcp_commit 을 다시 정의한다(0012 본문 + save_goal 부분).
-- ═══════════════════════════════════════════════════════════════════════════

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
  if char_length(btrim(coalesce(p_user_confirmation, ''))) < 2 then
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

