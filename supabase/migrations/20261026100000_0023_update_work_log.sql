-- ═══════════════════════════════════════════════════════════════════════════
-- 0023 update_work_log — 이미 올린 기록을 md 원문에서 고쳐 다시 저장한다 (docs/VOCAB.md §3 기록).
--   기록은 append-only 가 원칙이지만(0005), 오타 · 시간 · 프로젝트를 고치려고 지우고 다시 올리면
--   코드(L-날짜)가 바뀌고 홈에서 체크한 할 일 · 붙인 기한이 사라진다. 그래서 같은 행을 그대로 두고 내용만 바꾼다.
--   - 기록 행: id · 코드는 유지(날짜를 바꾸면 그 날짜 기준으로 코드를 새로 매긴다). raw_md · 요약 · 집계 갱신.
--   - 작업 · 시간표 · 기록 링크: 지우고 새 원문으로 다시 넣는다.
--   - 달성(## 목표 진행): 이 기록이 끝낸 계획 항목을 먼저 되돌리고(delete_work_log 와 같은 규칙) 새 원문대로 다시 끝낸다.
--   - 앞으로 할 일: **문장이 같은 줄은 그 행을 그대로 둔다**(완료 체크 · 프로젝트 · 기한 · 메모 유지, 순서만 갱신).
--     문장이 바뀌었거나 새로 생긴 줄은 새 행, 원문에서 빠진 줄의 행은 지운다.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.update_work_log(
  p_id uuid, p_log_date date, p_author_name text, p_summary text, p_raw_md text,
  p_items jsonb, p_hours jsonb, p_todos jsonb, p_completions text[], p_links jsonb
)
returns public.work_logs
language plpgsql security definer set search_path = ''
as $$
declare
  cur public.work_logs; v public.work_logs; it jsonb; h jsonb; td jsonb; c text;
  v_k int; v_code text; v_project uuid; v_goal uuid; v_pi uuid; v_done int := 0; v_hours numeric := 0;
  v_keep uuid[] := '{}'; v_tid uuid;
begin
  perform public.assert_owner();
  select * into cur from public.work_logs where id = p_id for update;
  if cur.id is null then raise exception '기록을 찾을 수 없습니다'; end if;
  if nullif(btrim(p_author_name), '') is null then raise exception '머리말의 author(실명)가 비어 있습니다'; end if;
  if nullif(btrim(p_raw_md), '') is null then raise exception '원문이 비어 있습니다'; end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception '작업 섹션이 하나도 없습니다'; end if;

  -- 코드: 날짜가 그대로면 유지, 바뀌면 새 날짜에서 insert_work_log 와 같은 규칙으로
  if p_log_date = cur.log_date then
    v_code := cur.code;
  else
    select count(*) into v_k from public.work_logs where log_date = p_log_date and id <> p_id;
    v_code := 'L-' || to_char(p_log_date, 'YYYY-MM-DD') || case when v_k = 0 then '' else '-' || (v_k + 1) end;
    if exists (select 1 from public.work_logs where code = v_code and id <> p_id) then
      raise exception '그 날짜의 기록 코드(%)가 이미 있습니다. 날짜를 확인해 주세요', v_code;
    end if;
  end if;

  select coalesce(sum((x->>'value')::numeric), 0) into v_hours from jsonb_array_elements(coalesce(p_hours, '[]'::jsonb)) x;
  select count(*) into v_done from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x where x->>'status' = '완료';

  -- 1. 달성 되돌리기 → 작업 · 시간표 · 기록 링크 비우기
  update public.plan_items set status = 'open', done_log_id = null where done_log_id = p_id;
  delete from public.item_completions where log_id = p_id;
  delete from public.work_items where log_id = p_id;
  delete from public.work_hours where log_id = p_id;
  delete from public.links where from_type = 'log' and from_id = p_id;

  update public.work_logs
     set code = v_code, log_date = p_log_date, author_name = btrim(p_author_name), summary = nullif(btrim(p_summary), ''),
         raw_md = p_raw_md, task_count = jsonb_array_length(p_items), done_count = v_done, hours_total = v_hours
   where id = p_id
  returning * into v;

  -- 2. 작업
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

  -- 3. 시간표
  for h in select * from jsonb_array_elements(coalesce(p_hours, '[]'::jsonb)) loop
    insert into public.work_hours (log_id, hour, value, label)
    values (v.id, (h->>'hour')::int, (h->>'value')::numeric, coalesce(h->>'label', ''))
    on conflict (log_id, hour) do update set value = excluded.value, label = excluded.label;
  end loop;

  -- 4. 앞으로 할 일 — 같은 문장은 행 유지(아직 짝지어지지 않은 것 중 순서가 앞선 행 하나)
  for td in select * from jsonb_array_elements(coalesce(p_todos, '[]'::jsonb)) loop
    v_pi := null;
    if nullif(td->>'plan_item_code', '') is not null then
      select id into v_pi from public.plan_items where code = upper(btrim(td->>'plan_item_code'));
    end if;
    select t.id into v_tid from public.log_todos t
     where t.log_id = p_id and t.text = btrim(td->>'text') and not (t.id = any (v_keep))
     order by t.seq, t.created_at limit 1;
    if v_tid is not null then
      update public.log_todos
         set seq = (td->>'seq')::int, needs_decision = coalesce((td->>'needs_decision')::boolean, false),
             plan_item_id = coalesce(v_pi, plan_item_id)
       where id = v_tid;
    else
      insert into public.log_todos (log_id, seq, text, needs_decision, plan_item_id)
      values (v.id, (td->>'seq')::int, btrim(td->>'text'), coalesce((td->>'needs_decision')::boolean, false), v_pi)
      returning id into v_tid;
    end if;
    v_keep := v_keep || v_tid;
  end loop;
  delete from public.log_todos where log_id = p_id and not (id = any (v_keep));

  -- 5. 달성 다시
  foreach c in array coalesce(p_completions, '{}') loop
    select id into v_pi from public.plan_items where code = upper(btrim(c));
    if v_pi is null then raise exception '목표 진행의 코드를 찾을 수 없습니다: %', c; end if;
    insert into public.item_completions (plan_item_id, log_id) values (v_pi, v.id) on conflict (plan_item_id) do nothing;
    update public.plan_items set status = 'done', done_log_id = coalesce(done_log_id, v.id) where id = v_pi;
  end loop;

  -- 6. 기록 링크
  perform public.insert_links('log', v.id, coalesce(p_links, '[]'::jsonb));
  return v;
end;
$$;
revoke execute on function public.update_work_log(uuid, date, text, text, text, jsonb, jsonb, jsonb, text[], jsonb) from public, anon;
grant  execute on function public.update_work_log(uuid, date, text, text, text, jsonb, jsonb, jsonb, text[], jsonb) to authenticated, service_role;
comment on function public.update_work_log(uuid, date, text, text, text, jsonb, jsonb, jsonb, text[], jsonb) is
  '올린 기록을 md 원문에서 고쳐 같은 행에 다시 저장. 할 일은 문장이 같으면 행 유지(체크 · 기한 · 프로젝트 보존). 0023';
