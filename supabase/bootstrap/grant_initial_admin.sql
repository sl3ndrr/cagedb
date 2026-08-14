-- supabase/bootstrap/grant_initial_admin.sql
-- Run only in the Supabase SQL Editor as the trusted database owner.
-- Replace the placeholder with the UUID copied from Authentication > Users.

begin;

do $$
declare
  target_user_id uuid := '78538355-c8d9-40d1-862d-61f031cda296';
  existing_admin_id uuid;
begin
  if target_user_id = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'Replace target_user_id with the real auth.users UUID.';
  end if;

  if not exists (
    select 1
    from auth.users as auth_user
    where auth_user.id = target_user_id
  ) then
    raise exception 'No auth.users row exists for UUID %.', target_user_id;
  end if;

  select admin_user.user_id
  into existing_admin_id
  from private.admin_users as admin_user
  where admin_user.singleton;

  if existing_admin_id is not null and existing_admin_id <> target_user_id then
    raise exception
      'A different CageDB admin is already configured: %.',
      existing_admin_id;
  end if;

  insert into private.admin_users (singleton, user_id)
  values (true, target_user_id)
  on conflict (singleton) do update
  set user_id = excluded.user_id
  where private.admin_users.user_id = excluded.user_id;
end;
$$;

commit;

-- Expected result: exactly one row containing your UUID and email.
select
  admin_user.user_id,
  auth_user.email,
  auth_user.email_confirmed_at is not null as email_confirmed
from private.admin_users as admin_user
join auth.users as auth_user on auth_user.id = admin_user.user_id;
