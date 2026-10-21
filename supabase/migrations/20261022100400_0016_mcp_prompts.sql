-- ═══════════════════════════════════════════════════════════════════════════
-- 0016 mcp_prompts — 사이트의 프롬프트 모음을 MCP 프롬프트(prompts/list · prompts/get)로 내보낸다
--   Claude Code 에서 /mcp__worklog__<이름> 으로 고르면 프롬프트 전문이 대화에 들어간다. 사이트에서 고치면 같이 바뀐다.
--   토큰 검사는 mcp_read 와 같다(private.mcp_auth).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.mcp_prompts(p_token text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.mcp_auth(p_token);
  return (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'purpose', p.purpose, 'body', p.body, 'sort', p.sort)
            order by p.sort, p.created_at), '[]'::jsonb) from public.prompts p);
end;
$$;
revoke execute on function public.mcp_prompts(text) from public;
grant  execute on function public.mcp_prompts(text) to anon, authenticated, service_role;
