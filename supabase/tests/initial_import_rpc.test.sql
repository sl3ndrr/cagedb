-- supabase/tests/initial_import_rpc.test.sql
begin;

create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;
set local search_path = pg_catalog, extensions, public;

select plan(4);

select ok(
  not has_function_privilege('anon', 'public.import_initial_films(jsonb)', 'execute'),
  'anon cannot execute the initial-import RPC'
);

select ok(
  not has_function_privilege('authenticated', 'public.import_initial_films(jsonb)', 'execute'),
  'authenticated users cannot execute the initial-import RPC'
);

select ok(
  has_function_privilege('service_role', 'public.import_initial_films(jsonb)', 'execute'),
  'service_role can execute the initial-import RPC'
);

select is(
  (
    select procedure.prosecdef
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'import_initial_films'
      and pg_get_function_identity_arguments(procedure.oid) = 'p_films jsonb'
  ),
  false,
  'initial-import RPC is security invoker'
);

select * from finish();
rollback;
