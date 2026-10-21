-- ═══════════════════════════════════════════════════════════════════════════
-- 0002 owner_guard — "로그인한 사용자 = 소유자" 판정 (admin · role 개념 없음, 루트 CLAUDE.md 절대규칙 3)
--   공개 가입이 꺼져 있어(config.toml) 로그인 가능한 계정은 scripts/create-owner.mjs 가 만든 소유자뿐이다.
--   모든 RPC 의 첫 줄이 이 함수다. 여럿이 쓰게 되면 owner_id 컬럼과 함께 소유권 판정으로 확장한다.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.assert_owner()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception '로그인이 필요합니다' using errcode = '42501';
  end if;
end;
$$;
comment on function public.assert_owner() is '호출자가 로그인한 소유자인지 확인. 아니면 42501. 모든 RPC 첫 줄. 0002';
revoke execute on function public.assert_owner() from public, anon;
grant  execute on function public.assert_owner() to authenticated, service_role;
