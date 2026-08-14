-- supabase/migrations/20260814000100_foundation_and_admin.sql
begin;

-- Keep authorization data outside the exposed public schema.
create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to service_role;

create table if not exists private.admin_users (
  singleton boolean primary key default true,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint admin_users_singleton check (singleton)
);

comment on table private.admin_users is
  'Authoritative allowlist for the single CageDB administrator.';
comment on column private.admin_users.user_id is
  'References auth.users.id. Membership can only be changed by a trusted database operator.';
comment on column private.admin_users.singleton is
  'Enforces the CageDB single-admin scope at database level.';

alter table private.admin_users enable row level security;
alter table private.admin_users force row level security;

-- No client-facing policy is created on private.admin_users.
revoke all on table private.admin_users from public;
revoke all on table private.admin_users from anon;
revoke all on table private.admin_users from authenticated;
grant select, insert, update, delete on table private.admin_users to service_role;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from private.admin_users as admin_user
      where admin_user.user_id = (select auth.uid())
    );
$$;

comment on function public.is_admin() is
  'Returns whether the current authenticated user is present in private.admin_users.';

revoke all on function public.is_admin() from public;
revoke all on function public.is_admin() from anon;
revoke all on function public.is_admin() from authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_admin() to service_role;

commit;
