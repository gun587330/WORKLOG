-- ═══════════════════════════════════════════════════════════════════════════
-- 0017 name_worklog — 이름 표기를 WORKLOG(붙여 씀)로 통일 (2026-10-22 지시)
--   프로젝트 P-WORKLOG 의 표시 이름, 프롬프트 본문, 컨텍스트 팩 머리글. 코드(P-WORKLOG)는 그대로다.
-- ═══════════════════════════════════════════════════════════════════════════

update public.projects set name = 'WORKLOG' where slug = 'WORKLOG';
update public.prompts set body = replace(body, 'WORK LOG', 'WORKLOG') where body like '%WORK LOG%';

create or replace function public.context_pack(p_from date default null, p_to date default null)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare out text; r record; pr record; ir record; v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_from date := coalesce(p_from, v_today - 7); v_to date := coalesce(p_to, v_today);
begin
  perform public.assert_owner();
  out := '# WORKLOG 컨텍스트 · ' || to_char(v_today, 'YYYY-MM-DD') || ' 기준 (한국 시간)' || E'\n';
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



