-- ═══════════════════════════════════════════════════════════════════════════
-- 0011 get_work_log_todos — 기록 상세의 할 일에 프로젝트 · 목표 · 기한 · 메모를 실어, 홈과 같은 폼으로 체크 · 수정 · 삭제하게 한다
--   get_work_log 를 다시 정의한다(0005 본문 + todos 부분). 2026-10-21 지시: "기록 상세에서 할 일 체크 · 수정을 홈과 같게".
-- ═══════════════════════════════════════════════════════════════════════════

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
                'plan_item_code', pi.code, 'project_slug', p.slug, 'goal_code', g.code, 'due_date', t.due_date, 'note', t.note, 'log_id', t.log_id) order by t.seq, t.created_at), '[]'::jsonb)
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

