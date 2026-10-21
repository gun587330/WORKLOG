-- ═══════════════════════════════════════════════════════════════════════════
-- 0012 mcp — 클로드(MCP)가 WORK LOG 를 읽고 쓰는 창구 (docs/VOCAB.md §7 · 루트 CLAUDE.md 절대규칙 10 · 11)
--
--   구조: 사이트의 /api/mcp(Next 라우트)가 클로드의 요청을 받아 아래 세 함수만 부른다.
--     mcp_read(토큰, 도구, 인자)                  읽기
--     mcp_prepare(토큰, 도구, 내용)               쓰기 1단계: 저장하지 않고 내용을 보관, 확인 번호 발급(15분, 1회)
--     mcp_commit(토큰, 도구, 확인 번호, 답변, 확인 목록)  쓰기 2단계: 사용자 확인이 갖춰졌을 때만 보관한 내용을 저장
--   세 함수는 anon 키로 불린다(서버에 service_role 을 두지 않기 위해). 대신 첫 줄에서 MCP 토큰을 검사하고, 통과하면
--   그 토큰 주인의 id 를 이번 트랜잭션의 로그인 사용자로 세워(set_config) 기존 RPC 의 assert_owner() 를 그대로 통과시킨다.
--   토큰은 원문이 아니라 sha256 해시만 저장한다. 발급은 scripts/create-mcp-token.mjs(service_role, 로컬)로만.
--
--   쓰기 안전장치(서버가 강제):
--     ① preview 없이 commit 불가(확인 번호) ② 확인 번호는 15분 · 1회 · 같은 도구 · 같은 토큰
--     ③ 사용자 답변 원문(user_confirmation) 없으면 거절 ④ 분류(프로젝트)는 항목마다 사용자 확인 목록이 있어야 저장
--     ⑤ 새 프로젝트는 기존 프로젝트 전부를 검토했다는 표시가 있어야 하고, 이름이 사실상 같으면 무조건 거절
--     ⑥ 지우기 도구는 없다(삭제는 사이트에서만) ⑦ 모든 AI 쓰기는 mcp_audit 에 남는다
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 표 ──────────────────────────────────────────────────────────────────────
create table private.mcp_tokens (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users (id) on delete cascade,
  label        text not null,
  token_hash   text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  last_used_at timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table private.mcp_tokens enable row level security;
create trigger mcp_tokens_set_updated_at before update on private.mcp_tokens for each row execute function public.set_updated_at();
comment on table private.mcp_tokens is 'MCP 개인 토큰(sha256 해시만). 발급 · 폐기는 scripts/create-mcp-token.mjs. 0012';

create table private.mcp_pending (
  code        text primary key,
  token_id    uuid not null references private.mcp_tokens (id) on delete cascade,
  tool        text not null,
  payload     jsonb not null,
  candidates  text[] not null default '{}',
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table private.mcp_pending enable row level security;
create trigger mcp_pending_set_updated_at before update on private.mcp_pending for each row execute function public.set_updated_at();
comment on table private.mcp_pending is 'MCP 쓰기 1단계(preview)가 보관한 내용과 확인 번호. 15분 · 1회. 0012';

create table public.mcp_audit (
  id                uuid primary key default gen_random_uuid(),
  tool              text not null,
  token_label       text not null,
  payload           jsonb not null,
  confirmations     jsonb not null default '[]'::jsonb,
  user_confirmation text not null,
  result            jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
alter table public.mcp_audit enable row level security;
create trigger mcp_audit_set_updated_at before update on public.mcp_audit for each row execute function public.set_updated_at();
create index mcp_audit_created_idx on public.mcp_audit (created_at desc);
comment on table public.mcp_audit is 'AI(MCP)가 저장한 모든 변경: 도구 · 내용 · 사용자 확인 답변 원문 · 결과. deny-all RLS, RPC 로만. 0012';

-- ── 내부 함수 ────────────────────────────────────────────────────────────────
-- 이름 비교용 정규화: 공백 · 가운뎃점 · 밑줄 · 하이픈 제거 + 소문자 ("AI STUDY" = "ai-study")
create or replace function private.mcp_norm(t text)
returns text language sql immutable set search_path = ''
as $$ select lower(regexp_replace(coalesce(t, ''), '[[:space:]·_-]', '', 'g')) $$;

-- 'P-ANSERX' · 'anserx' → 'ANSERX'
create or replace function private.mcp_slug(t text)
returns text language sql immutable set search_path = ''
as $$ select upper(regexp_replace(btrim(coalesce(t, '')), '^[Pp]-', '')) $$;

-- 토큰 검사 → 토큰 주인을 이번 트랜잭션의 로그인 사용자로 세운다(기존 RPC 의 assert_owner 통과용)
create or replace function private.mcp_auth(p_token text)
returns private.mcp_tokens
language plpgsql security definer set search_path = ''
as $$
declare v private.mcp_tokens;
begin
  if p_token is null or char_length(p_token) < 20 then
    raise exception 'MCP 토큰이 없습니다' using errcode = '42501';
  end if;
  select * into v from private.mcp_tokens
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') and revoked_at is null;
  if v.id is null then raise exception 'MCP 토큰이 올바르지 않거나 폐기됐습니다' using errcode = '42501'; end if;
  update private.mcp_tokens set last_used_at = now() where id = v.id;
  perform set_config('request.jwt.claim.sub', v.owner_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v.owner_id, 'role', 'authenticated')::text, true);
  return v;
end;
$$;
revoke execute on function private.mcp_auth(text) from public, anon, authenticated;

-- ── 토큰 발급 · 폐기 (service_role 전용 = 로컬 스크립트) ─────────────────────
create or replace function public.issue_mcp_token(p_owner_email text, p_label text, p_token_hash text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_owner uuid; v_id uuid;
begin
  select id into v_owner from auth.users where lower(email) = lower(btrim(p_owner_email));
  if v_owner is null then raise exception '계정을 찾을 수 없습니다: %', p_owner_email; end if;
  insert into private.mcp_tokens (owner_id, label, token_hash)
  values (v_owner, coalesce(nullif(btrim(p_label), ''), 'MCP'), p_token_hash)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'label', coalesce(nullif(btrim(p_label), ''), 'MCP'));
end;
$$;
revoke execute on function public.issue_mcp_token(text, text, text) from public, anon, authenticated;
grant  execute on function public.issue_mcp_token(text, text, text) to service_role;

create or replace function public.revoke_mcp_tokens(p_label text default null)
returns int
language plpgsql security definer set search_path = ''
as $$
declare n int;
begin
  update private.mcp_tokens set revoked_at = now()
   where revoked_at is null and (p_label is null or label = p_label);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.revoke_mcp_tokens(text) from public, anon, authenticated;
grant  execute on function public.revoke_mcp_tokens(text) to service_role;

-- ── 읽기 ────────────────────────────────────────────────────────────────────
create or replace function public.mcp_read(p_token text, p_tool text, p_args jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare t private.mcp_tokens; a jsonb := coalesce(p_args, '{}'::jsonb); r jsonb; v_id uuid;
begin
  t := private.mcp_auth(p_token);
  case p_tool
    when 'whoami' then
      r := jsonb_build_object('label', t.label);
    when 'get_context_pack' then
      r := to_jsonb(public.context_pack(nullif(a->>'from', '')::date, nullif(a->>'to', '')::date));
    when 'list_projects' then
      select coalesce(jsonb_agg(jsonb_build_object('code', 'P-' || x.slug, 'name', x.name, 'abbr', x.abbr, 'description', x.description, 'status', x.status) order by x.sort), '[]'::jsonb)
        into r from public.list_projects(coalesce((a->>'include_archived')::boolean, false)) x;
    when 'list_goals' then
      select coalesce(jsonb_agg(jsonb_build_object('code', x.code, 'title', x.title, 'project', 'P-' || x.project_slug, 'period_start', x.period_start,
               'period_end', x.period_end, 'status', x.status, 'note', x.note, 'items', x.item_count, 'done', x.done_count)), '[]'::jsonb)
        into r from public.list_goals(nullif(a->>'status', '')) x;
    when 'list_plans' then
      select coalesce(jsonb_agg(jsonb_build_object('code', x.code, 'title', x.title, 'period_start', x.period_start, 'period_end', x.period_end,
               'status', x.status, 'summary', x.summary, 'goals', x.goal_count, 'items', x.item_count, 'done', x.done_count,
               'projects', (select coalesce(jsonb_agg('P-' || s), '[]'::jsonb) from unnest(x.project_slugs) s))), '[]'::jsonb)
        into r from public.list_plans() x;
    when 'get_plan' then
      select id into v_id from public.plans where code = upper(btrim(a->>'code'));
      if v_id is null then raise exception '계획 코드를 찾을 수 없습니다: %', a->>'code'; end if;
      r := public.get_plan(v_id);
    when 'list_plan_items' then
      select coalesce(jsonb_agg(jsonb_build_object('code', i.code, 'title', i.title, 'status', i.status, 'due_date', i.due_date,
               'goal', g.code, 'project', 'P-' || p.slug, 'plan', pl.code) order by i.due_date nulls last, i.code), '[]'::jsonb)
        into r
        from public.plan_items i join public.goals g on g.id = i.goal_id join public.projects p on p.id = g.project_id
        join public.plans pl on pl.id = i.plan_id
       where (nullif(a->>'status', '') is null or i.status = a->>'status')
         and (nullif(a->>'plan', '') is null or pl.code = upper(a->>'plan'));
    when 'list_logs' then
      select coalesce(jsonb_agg(jsonb_build_object('code', x.code, 'date', x.log_date, 'summary', x.summary, 'tasks', x.task_count,
               'done', x.done_count, 'hours', x.hours_total,
               'projects', (select coalesce(jsonb_agg('P-' || s), '[]'::jsonb) from unnest(x.project_slugs) s))), '[]'::jsonb)
        into r from public.list_work_logs(nullif(private.mcp_slug(a->>'project'), ''), nullif(a->>'from', '')::date,
                                          nullif(a->>'to', '')::date, coalesce((a->>'limit')::int, 30)) x;
    when 'get_log' then
      select id into v_id from public.work_logs where code = upper(btrim(a->>'code'));
      if v_id is null then raise exception '기록 코드를 찾을 수 없습니다: %', a->>'code'; end if;
      r := public.get_work_log(v_id);
    when 'list_todos' then
      select coalesce(jsonb_agg(jsonb_build_object('id', td.id, 'text', td.text, 'needs_decision', td.needs_decision, 'done', td.done,
               'source', coalesce(l.code, '직접 추가'), 'plan_item', pi.code, 'project', case when p.slug is null then null else 'P-' || p.slug end,
               'goal', g.code, 'due_date', td.due_date, 'note', td.note) order by td.done, td.due_date nulls last, td.created_at desc), '[]'::jsonb)
        into r
        from public.log_todos td left join public.work_logs l on l.id = td.log_id left join public.plan_items pi on pi.id = td.plan_item_id
        left join public.projects p on p.id = td.project_id left join public.goals g on g.id = td.goal_id
       where coalesce((a->>'include_done')::boolean, false) or not td.done;
    when 'list_ai_writes' then
      select coalesce(jsonb_agg(jsonb_build_object('at', m.created_at, 'tool', m.tool, 'token', m.token_label,
               'user_confirmation', m.user_confirmation, 'result', m.result) order by m.created_at desc), '[]'::jsonb)
        into r from (select * from public.mcp_audit order by created_at desc limit greatest(1, least(coalesce((a->>'limit')::int, 20), 200))) m;
    else
      raise exception '알 수 없는 읽기 도구: %', p_tool;
  end case;
  return r;
end;
$$;
revoke execute on function public.mcp_read(text, text, jsonb) from public;
grant  execute on function public.mcp_read(text, text, jsonb) to anon, authenticated, service_role;

-- ── 쓰기 1단계: 내용 보관 + 확인 번호 ─────────────────────────────────────────
create or replace function public.mcp_prepare(p_token text, p_tool text, p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare t private.mcp_tokens; v_code text; v_exp timestamptz := now() + interval '15 minutes'; v_cand text[] := '{}'; r jsonb := '{}'::jsonb;
  v_slug text; v_name text; v_dup text;
begin
  t := private.mcp_auth(p_token);
  if p_tool not in ('upload_log', 'upload_plan', 'create_project', 'save_goal', 'save_todo', 'set_todo_done', 'set_plan_item_status') then
    raise exception '알 수 없는 쓰기 도구: %', p_tool;
  end if;
  delete from private.mcp_pending where expires_at < now() - interval '1 day';

  if p_tool = 'create_project' then
    v_slug := private.mcp_slug(p_payload->>'slug');
    v_name := btrim(coalesce(p_payload->>'name', ''));
    if v_slug !~ '^[A-Z0-9][A-Z0-9-]{0,30}$' then raise exception '프로젝트 코드는 영문 대문자 · 숫자 · 하이픈만 됩니다: %', p_payload->>'slug'; end if;
    if v_name = '' then raise exception '프로젝트 이름이 비어 있습니다'; end if;
    if char_length(btrim(coalesce(p_payload->>'abbr', ''))) not between 1 and 3 then raise exception '약칭은 1~3자입니다'; end if;
    select 'P-' || slug || ' ' || name into v_dup from public.projects
     where slug = v_slug or private.mcp_norm(name) = private.mcp_norm(v_name) limit 1;
    if v_dup is not null then raise exception '이미 있는 프로젝트와 같습니다: %. 새로 만들지 않고 기존 프로젝트를 씁니다', v_dup; end if;
    -- 검토 대상 = 활성 프로젝트 전부. commit 때 이 목록 전부를 검토했다는 표시가 있어야 한다
    select coalesce(array_agg(slug order by sort), '{}') into v_cand from public.projects where status = 'active';
    select jsonb_build_object('existing_projects', coalesce(jsonb_agg(jsonb_build_object('code', 'P-' || slug, 'name', name, 'abbr', abbr,
             'description', description,
             'looks_similar', private.mcp_norm(name) like '%' || private.mcp_norm(v_name) || '%' or private.mcp_norm(v_name) like '%' || private.mcp_norm(name) || '%'
                              or slug like '%' || v_slug || '%' or v_slug like '%' || slug || '%') order by sort), '[]'::jsonb))
      into r from public.projects where status = 'active';
  end if;

  v_code := upper(encode(extensions.gen_random_bytes(4), 'hex'));
  insert into private.mcp_pending (code, token_id, tool, payload, candidates, expires_at)
  values (v_code, t.id, p_tool, p_payload, v_cand, v_exp);
  return r || jsonb_build_object('confirm_code', v_code, 'expires_at', v_exp);
end;
$$;
revoke execute on function public.mcp_prepare(text, text, jsonb) from public;
grant  execute on function public.mcp_prepare(text, text, jsonb) to anon, authenticated, service_role;

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
      select to_jsonb(x) into r from public.upsert_goal(nullif(p->>'id', '')::uuid, p->>'title', private.mcp_slug(p->>'project_slug'),
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

-- 사이트에서 "AI 가 쓴 것" 을 볼 때(화면은 다음 단계)
create or replace function public.list_mcp_audit(p_limit int default 50)
returns setof public.mcp_audit
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_owner();
  return query select * from public.mcp_audit order by created_at desc limit greatest(1, least(coalesce(p_limit, 50), 500));
end;
$$;
revoke execute on function public.list_mcp_audit(int) from public, anon;
grant  execute on function public.list_mcp_audit(int) to authenticated, service_role;
