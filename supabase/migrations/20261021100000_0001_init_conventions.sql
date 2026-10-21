-- ═══════════════════════════════════════════════════════════════════════════
-- 0001 init_conventions — 이후 모든 마이그레이션이 딛는 공통 기반 (anserx 0001 에서 옮김)
--   ① extensions ② private 스키마 + 권한 봉쇄 ③ set_updated_at() 트리거 함수
-- 근거: docs/backend/CONVENTIONS.md §1·§3. 원격 적용 후 수정하지 않는다.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;

-- private: 클라이언트가 절대 접근하면 안 되는 테이블 전용. PostgREST 미노출(config.toml [api] schemas) + 권한 회수.
create schema if not exists private;
comment on schema private is
  '클라이언트가 접근하면 안 되는 내부 테이블 전용. PostgREST 에 노출되지 않고 service_role 만 접근한다. CONVENTIONS §1';
revoke all on schema private from anon, authenticated;
alter default privileges in schema private revoke all on tables    from anon, authenticated;
alter default privileges in schema private revoke all on sequences from anon, authenticated;
alter default privileges in schema private revoke all on functions from anon, authenticated;
grant usage on schema private to service_role;
alter default privileges in schema private grant all on tables    to service_role;
alter default privileges in schema private grant all on sequences to service_role;

-- updated_at 자동 갱신 — 모든 테이블에 부착한다(절대규칙 2)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
comment on function public.set_updated_at() is 'updated_at 을 현재 시각으로 갱신하는 트리거 함수. 새 테이블마다 부착. 0001';
revoke execute on function public.set_updated_at() from public, anon, authenticated;
