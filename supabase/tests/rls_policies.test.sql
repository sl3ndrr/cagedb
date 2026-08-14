-- supabase/tests/rls_policies.test.sql
begin;

create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;

-- Test-only grants are rolled back at the end of this file.
grant usage on schema extensions to anon, authenticated;
grant execute on all functions in schema extensions to anon, authenticated;
set local search_path = pg_catalog, extensions, public, private, auth, storage;

select * from no_plan();

-- Fixed test identities. They exist only inside this transaction.
insert into auth.users (id, email)
values
  ('90000000-0000-4000-8000-000000000001', 'cagedb-non-admin@example.invalid'),
  ('90000000-0000-4000-8000-000000000002', 'cagedb-admin@example.invalid')
on conflict (id) do nothing;

insert into private.admin_users (singleton, user_id)
values (true, '90000000-0000-4000-8000-000000000002')
on conflict (singleton) do update
set user_id = excluded.user_id;

-- Seed published and draft rows as the database owner.
insert into public.films (
  id,
  legacy_import_id,
  release_year,
  original_title,
  my_rating_percent,
  published
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'rls-published-001',
    2020,
    'Published Film One',
    80,
    true
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'rls-draft-002',
    2021,
    'Draft Film',
    null,
    false
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    'rls-published-003',
    2022,
    'Published Film Two',
    null,
    true
  );

insert into public.genres (id, name, slug, published)
values
  ('20000000-0000-4000-8000-000000000001', 'Published Genre', 'rls-published-genre', true),
  ('20000000-0000-4000-8000-000000000002', 'Draft Genre', 'rls-draft-genre', false);

insert into public.film_genres (film_id, genre_id)
values
  (
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000002'
  );

insert into public.film_metrics (film_id, wig, scream_intensity, explosions, overacting_level)
values
  ('10000000-0000-4000-8000-000000000001', 2, 3, 4, 5),
  ('10000000-0000-4000-8000-000000000002', 1, 1, 1, 1);

insert into public.tags (id, name, slug, kind, published)
values
  ('30000000-0000-4000-8000-000000000001', 'Published Tag', 'rls-published-tag', 'running_gag', true),
  ('30000000-0000-4000-8000-000000000002', 'Draft Tag', 'rls-draft-tag', 'general', false);

insert into public.film_tags (film_id, tag_id)
values
  (
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000002'
  );

insert into public.film_scores (
  id,
  film_id,
  provider,
  rt_tomatometer_percent,
  source_url,
  retrieved_at,
  source_note
)
values (
  '40000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'rotten_tomatoes',
  75,
  'https://example.invalid/verified-rt-source',
  date '2026-08-14',
  'Verified test score'
);

-- This simulates the service-role-only legacy import path.
insert into public.film_scores (
  id,
  film_id,
  provider,
  imdb_score,
  source_note
)
values (
  '40000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  'imdb',
  6.5,
  'Legacy import without public provenance'
);

insert into public.editorial_content (
  id,
  content_type,
  title,
  body,
  source_label,
  published
)
values
  (
    '50000000-0000-4000-8000-000000000001',
    'fact',
    'Published Fact',
    'Published body',
    'Test source',
    true
  ),
  (
    '50000000-0000-4000-8000-000000000002',
    'biography',
    'Draft Biography',
    'Draft body',
    null,
    false
  );

insert into public.upcoming_releases (
  id,
  original_title,
  source_label,
  source_checked_at,
  published
)
values
  (
    '60000000-0000-4000-8000-000000000001',
    'Published Upcoming Release',
    'Test source',
    date '2026-08-14',
    true
  ),
  (
    '60000000-0000-4000-8000-000000000002',
    'Draft Upcoming Release',
    'Test source',
    date '2026-08-14',
    false
  );

insert into public.film_connections (
  id,
  source_film_id,
  target_film_id,
  connection_type,
  source_label,
  published
)
values
  (
    '70000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000003',
    'published-test-link',
    'Test source',
    true
  ),
  (
    '70000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    'draft-test-link',
    'Test source',
    false
  );

-- Policy inventory: this makes accidental extra or missing policies visible.
select results_eq(
  $$select policyname from pg_policies where schemaname = 'public' and tablename = 'films' order by policyname$$,
  array['films_admin_all', 'films_public_read']::text[],
  'films has exactly the expected policies'
);
select results_eq(
  $$select policyname from pg_policies where schemaname = 'public' and tablename = 'genres' order by policyname$$,
  array['genres_admin_all', 'genres_public_read']::text[],
  'genres has exactly the expected policies'
);
select results_eq(
  $$select policyname from pg_policies where schemaname = 'public' and tablename = 'film_genres' order by policyname$$,
  array['film_genres_admin_all', 'film_genres_public_read']::text[],
  'film_genres has exactly the expected policies'
);
select results_eq(
  $$select policyname from pg_policies where schemaname = 'public' and tablename = 'film_metrics' order by policyname$$,
  array['film_metrics_admin_all', 'film_metrics_public_read']::text[],
  'film_metrics has exactly the expected policies'
);
select results_eq(
  $$select policyname from pg_policies where schemaname = 'public' and tablename = 'tags' order by policyname$$,
  array['tags_admin_all', 'tags_public_read']::text[],
  'tags has exactly the expected policies'
);
select results_eq(
  $$select policyname from pg_policies where schemaname = 'public' and tablename = 'film_tags' order by policyname$$,
  array['film_tags_admin_all', 'film_tags_public_read']::text[],
  'film_tags has exactly the expected policies'
);
select results_eq(
  $$select policyname from pg_policies where schemaname = 'public' and tablename = 'film_scores' order by policyname$$,
  array[
    'film_scores_admin_delete',
    'film_scores_admin_insert_verified',
    'film_scores_admin_read',
    'film_scores_admin_update_verified',
    'film_scores_public_read'
  ]::text[],
  'film_scores has exactly the expected policies'
);
select results_eq(
  $$select policyname from pg_policies where schemaname = 'public' and tablename = 'editorial_content' order by policyname$$,
  array['editorial_content_admin_all', 'editorial_content_public_read']::text[],
  'editorial_content has exactly the expected policies'
);
select results_eq(
  $$select policyname from pg_policies where schemaname = 'public' and tablename = 'upcoming_releases' order by policyname$$,
  array['upcoming_releases_admin_all', 'upcoming_releases_public_read']::text[],
  'upcoming_releases has exactly the expected policies'
);
select results_eq(
  $$select policyname from pg_policies where schemaname = 'public' and tablename = 'film_connections' order by policyname$$,
  array['film_connections_admin_all', 'film_connections_public_read']::text[],
  'film_connections has exactly the expected policies'
);
select results_eq(
  $$select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'film_posters_%' order by policyname$$,
  array[
    'film_posters_admin_delete',
    'film_posters_admin_insert',
    'film_posters_admin_select',
    'film_posters_admin_update'
  ]::text[],
  'poster storage has exactly the four CageDB policies'
);
select is_empty(
  $$select 1 from pg_policies where schemaname = 'private' and tablename = 'admin_users'$$,
  'admin_users has no client-facing RLS policy'
);

-- Anonymous visibility.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  'select public.is_admin()',
  '42501',
  null,
  'anon cannot call the admin helper'
);
select is((select count(*) from public.films), 2::bigint, 'anon sees only published films');
select is((select count(*) from public.genres), 1::bigint, 'anon sees only published genres');
select is((select count(*) from public.film_genres), 1::bigint, 'anon sees only public genre links');
select is((select count(*) from public.film_metrics), 1::bigint, 'anon sees metrics only for published films');
select is((select count(*) from public.tags), 1::bigint, 'anon sees only published tags');
select is((select count(*) from public.film_tags), 1::bigint, 'anon sees only public tag links');
select is((select count(*) from public.film_scores), 1::bigint, 'anon sees only sourced scores for published films');
select is((select count(*) from public.editorial_content), 1::bigint, 'anon sees only published editorial content');
select is((select count(*) from public.upcoming_releases), 1::bigint, 'anon sees only published upcoming releases');
select is((select count(*) from public.film_connections), 1::bigint, 'anon sees only public connections between public films');

select throws_ok(
  $$insert into public.films (original_title) values ('Anon Insert')$$,
  '42501', null, 'anon cannot insert films'
);
select throws_ok(
  $$insert into public.genres (name, slug) values ('Anon Genre', 'anon-genre')$$,
  '42501', null, 'anon cannot insert genres'
);
select throws_ok(
  $$insert into public.film_genres (film_id, genre_id) values ('10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'anon cannot insert film_genres'
);
select throws_ok(
  $$insert into public.film_metrics (film_id, wig) values ('10000000-0000-4000-8000-000000000003', 1)$$,
  '42501', null, 'anon cannot insert film_metrics'
);
select throws_ok(
  $$insert into public.tags (name, slug) values ('Anon Tag', 'anon-tag')$$,
  '42501', null, 'anon cannot insert tags'
);
select throws_ok(
  $$insert into public.film_tags (film_id, tag_id) values ('10000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'anon cannot insert film_tags'
);
select throws_ok(
  $$insert into public.film_scores (film_id, provider, imdb_score, source_url, retrieved_at) values ('10000000-0000-4000-8000-000000000003', 'imdb', 6.0, 'https://example.invalid/anon', date '2026-08-14')$$,
  '42501', null, 'anon cannot insert film_scores'
);
select throws_ok(
  $$insert into public.editorial_content (content_type, body) values ('biography', 'Anon')$$,
  '42501', null, 'anon cannot insert editorial content'
);
select throws_ok(
  $$insert into public.upcoming_releases (original_title, source_label, source_checked_at) values ('Anon', 'Test', date '2026-08-14')$$,
  '42501', null, 'anon cannot insert upcoming releases'
);
select throws_ok(
  $$insert into public.film_connections (source_film_id, target_film_id, connection_type, source_label) values ('10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 'anon-link', 'Test')$$,
  '42501', null, 'anon cannot insert film connections'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('film-posters', '10000000-0000-4000-8000-000000000001/anon.jpg')$$,
  '42501', null, 'anon cannot insert poster metadata'
);

reset role;

-- Authenticated non-admin visibility and write denial.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"90000000-0000-4000-8000-000000000001"}',
  true
);

select is(public.is_admin(), false, 'authenticated non-admin is not an admin');
select is((select count(*) from public.films), 2::bigint, 'non-admin sees only published films');
select is((select count(*) from public.genres), 1::bigint, 'non-admin sees only published genres');
select is((select count(*) from public.film_genres), 1::bigint, 'non-admin sees only public genre links');
select is((select count(*) from public.film_metrics), 1::bigint, 'non-admin sees only public metrics');
select is((select count(*) from public.tags), 1::bigint, 'non-admin sees only public tags');
select is((select count(*) from public.film_tags), 1::bigint, 'non-admin sees only public tag links');
select is((select count(*) from public.film_scores), 1::bigint, 'non-admin cannot see unverified legacy scores');
select is((select count(*) from public.editorial_content), 1::bigint, 'non-admin sees only published editorial content');
select is((select count(*) from public.upcoming_releases), 1::bigint, 'non-admin sees only published upcoming releases');
select is((select count(*) from public.film_connections), 1::bigint, 'non-admin sees only published connections');

select throws_ok(
  $$insert into public.films (original_title) values ('Non-admin Insert')$$,
  '42501', null, 'non-admin cannot insert films'
);
select throws_ok(
  $$insert into public.genres (name, slug) values ('Non-admin Genre', 'non-admin-genre')$$,
  '42501', null, 'non-admin cannot insert genres'
);
select throws_ok(
  $$insert into public.film_genres (film_id, genre_id) values ('10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'non-admin cannot insert film_genres'
);
select throws_ok(
  $$insert into public.film_metrics (film_id, wig) values ('10000000-0000-4000-8000-000000000003', 1)$$,
  '42501', null, 'non-admin cannot insert film_metrics'
);
select throws_ok(
  $$insert into public.tags (name, slug) values ('Non-admin Tag', 'non-admin-tag')$$,
  '42501', null, 'non-admin cannot insert tags'
);
select throws_ok(
  $$insert into public.film_tags (film_id, tag_id) values ('10000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'non-admin cannot insert film_tags'
);
select throws_ok(
  $$insert into public.film_scores (film_id, provider, imdb_score, source_url, retrieved_at) values ('10000000-0000-4000-8000-000000000003', 'imdb', 6.0, 'https://example.invalid/non-admin', date '2026-08-14')$$,
  '42501', null, 'non-admin cannot insert film_scores'
);
select throws_ok(
  $$insert into public.editorial_content (content_type, body) values ('biography', 'Non-admin')$$,
  '42501', null, 'non-admin cannot insert editorial content'
);
select throws_ok(
  $$insert into public.upcoming_releases (original_title, source_label, source_checked_at) values ('Non-admin', 'Test', date '2026-08-14')$$,
  '42501', null, 'non-admin cannot insert upcoming releases'
);
select throws_ok(
  $$insert into public.film_connections (source_film_id, target_film_id, connection_type, source_label) values ('10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 'non-admin-link', 'Test')$$,
  '42501', null, 'non-admin cannot insert film connections'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('film-posters', '10000000-0000-4000-8000-000000000001/non-admin.jpg')$$,
  '42501', null, 'non-admin cannot insert poster metadata'
);

select results_eq(
  $$update public.films set notes = 'blocked' where id = '10000000-0000-4000-8000-000000000001' returning id$$,
  array[]::uuid[],
  'non-admin cannot update films'
);
select results_eq(
  $$update public.genres set name = name where id = '20000000-0000-4000-8000-000000000001' returning id$$,
  array[]::uuid[],
  'non-admin cannot update genres'
);
select results_eq(
  $$update public.film_genres set created_at = created_at where film_id = '10000000-0000-4000-8000-000000000001' returning film_id$$,
  array[]::uuid[],
  'non-admin cannot update film_genres'
);
select results_eq(
  $$update public.film_metrics set wig = 0 where film_id = '10000000-0000-4000-8000-000000000001' returning film_id$$,
  array[]::uuid[],
  'non-admin cannot update film_metrics'
);
select results_eq(
  $$update public.tags set name = name where id = '30000000-0000-4000-8000-000000000001' returning id$$,
  array[]::uuid[],
  'non-admin cannot update tags'
);
select results_eq(
  $$update public.film_tags set created_at = created_at where film_id = '10000000-0000-4000-8000-000000000001' returning film_id$$,
  array[]::uuid[],
  'non-admin cannot update film_tags'
);
select results_eq(
  $$update public.film_scores set source_note = 'blocked' where id = '40000000-0000-4000-8000-000000000001' returning id$$,
  array[]::uuid[],
  'non-admin cannot update film_scores'
);
select results_eq(
  $$update public.editorial_content set body = 'blocked' where id = '50000000-0000-4000-8000-000000000001' returning id$$,
  array[]::uuid[],
  'non-admin cannot update editorial content'
);
select results_eq(
  $$update public.upcoming_releases set notes = 'blocked' where id = '60000000-0000-4000-8000-000000000001' returning id$$,
  array[]::uuid[],
  'non-admin cannot update upcoming releases'
);
select results_eq(
  $$update public.film_connections set description = 'blocked' where id = '70000000-0000-4000-8000-000000000001' returning id$$,
  array[]::uuid[],
  'non-admin cannot update film connections'
);

select results_eq(
  $$delete from public.films where id = '10000000-0000-4000-8000-000000000001' returning id$$,
  array[]::uuid[],
  'non-admin cannot delete films'
);
select results_eq(
  $$delete from public.genres where id = '20000000-0000-4000-8000-000000000001' returning id$$,
  array[]::uuid[],
  'non-admin cannot delete genres'
);
select results_eq(
  $$delete from public.film_genres where film_id = '10000000-0000-4000-8000-000000000001' returning film_id$$,
  array[]::uuid[],
  'non-admin cannot delete film_genres'
);
select results_eq(
  $$delete from public.film_metrics where film_id = '10000000-0000-4000-8000-000000000001' returning film_id$$,
  array[]::uuid[],
  'non-admin cannot delete film_metrics'
);
select results_eq(
  $$delete from public.tags where id = '30000000-0000-4000-8000-000000000001' returning id$$,
  array[]::uuid[],
  'non-admin cannot delete tags'
);
select results_eq(
  $$delete from public.film_tags where film_id = '10000000-0000-4000-8000-000000000001' returning film_id$$,
  array[]::uuid[],
  'non-admin cannot delete film_tags'
);
select results_eq(
  $$delete from public.film_scores where id = '40000000-0000-4000-8000-000000000001' returning id$$,
  array[]::uuid[],
  'non-admin cannot delete film_scores'
);
select results_eq(
  $$delete from public.editorial_content where id = '50000000-0000-4000-8000-000000000001' returning id$$,
  array[]::uuid[],
  'non-admin cannot delete editorial content'
);
select results_eq(
  $$delete from public.upcoming_releases where id = '60000000-0000-4000-8000-000000000001' returning id$$,
  array[]::uuid[],
  'non-admin cannot delete upcoming releases'
);
select results_eq(
  $$delete from public.film_connections where id = '70000000-0000-4000-8000-000000000001' returning id$$,
  array[]::uuid[],
  'non-admin cannot delete film connections'
);

reset role;

-- Admin visibility and full CRUD behavior.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"90000000-0000-4000-8000-000000000002"}',
  true
);

select is(public.is_admin(), true, 'allowlisted authenticated user is admin');
select is((select count(*) from public.films), 3::bigint, 'admin sees published and draft films');
select is((select count(*) from public.genres), 2::bigint, 'admin sees published and draft genres');
select is((select count(*) from public.film_genres), 2::bigint, 'admin sees all genre links');
select is((select count(*) from public.film_metrics), 2::bigint, 'admin sees all metrics');
select is((select count(*) from public.tags), 2::bigint, 'admin sees all tags');
select is((select count(*) from public.film_tags), 2::bigint, 'admin sees all tag links');
select is((select count(*) from public.film_scores), 2::bigint, 'admin sees verified and legacy scores');
select is((select count(*) from public.editorial_content), 2::bigint, 'admin sees all editorial content');
select is((select count(*) from public.upcoming_releases), 2::bigint, 'admin sees all upcoming releases');
select is((select count(*) from public.film_connections), 2::bigint, 'admin sees all film connections');

select throws_ok(
  $$update public.film_scores set imdb_score = 6.6 where id = '40000000-0000-4000-8000-000000000002'$$,
  '42501', null,
  'admin cannot change an unverified legacy score without adding provenance'
);
select lives_ok(
  $$update public.film_scores set source_url = 'https://example.invalid/verified-imdb-source', retrieved_at = date '2026-08-14' where id = '40000000-0000-4000-8000-000000000002'$$,
  'admin can complete legacy score provenance'
);

select lives_ok(
  $$insert into public.films (id, legacy_import_id, original_title) values ('10000000-0000-4000-8000-000000000010', 'rls-admin-010', 'Admin Film')$$,
  'admin can insert films'
);
select lives_ok(
  $$insert into public.genres (id, name, slug) values ('20000000-0000-4000-8000-000000000010', 'Admin Genre', 'rls-admin-genre')$$,
  'admin can insert genres'
);
select lives_ok(
  $$insert into public.film_genres (film_id, genre_id) values ('10000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000010')$$,
  'admin can insert film_genres'
);
select lives_ok(
  $$insert into public.film_metrics (film_id, wig) values ('10000000-0000-4000-8000-000000000010', 2)$$,
  'admin can insert film_metrics'
);
select lives_ok(
  $$insert into public.tags (id, name, slug) values ('30000000-0000-4000-8000-000000000010', 'Admin Tag', 'rls-admin-tag')$$,
  'admin can insert tags'
);
select lives_ok(
  $$insert into public.film_tags (film_id, tag_id) values ('10000000-0000-4000-8000-000000000010', '30000000-0000-4000-8000-000000000010')$$,
  'admin can insert film_tags'
);
select lives_ok(
  $$insert into public.film_scores (id, film_id, provider, imdb_score, source_url, retrieved_at) values ('40000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000010', 'imdb', 6.5, 'https://example.invalid/admin-score', date '2026-08-14')$$,
  'admin can insert a sourced film score'
);
select lives_ok(
  $$insert into public.editorial_content (id, content_type, body) values ('50000000-0000-4000-8000-000000000010', 'biography', 'Admin body')$$,
  'admin can insert editorial content'
);
select lives_ok(
  $$insert into public.upcoming_releases (id, original_title, source_label, source_checked_at) values ('60000000-0000-4000-8000-000000000010', 'Admin Upcoming', 'Test source', date '2026-08-14')$$,
  'admin can insert upcoming releases'
);
select lives_ok(
  $$insert into public.film_connections (id, source_film_id, target_film_id, connection_type, source_label) values ('70000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000001', 'admin-link', 'Test source')$$,
  'admin can insert film connections'
);

select lives_ok(
  $$update public.films set notes = 'updated' where id = '10000000-0000-4000-8000-000000000010'$$,
  'admin can update films'
);
select lives_ok(
  $$update public.genres set accent_color = '#FF6655' where id = '20000000-0000-4000-8000-000000000010'$$,
  'admin can update genres'
);
select lives_ok(
  $$update public.film_genres set created_at = created_at where film_id = '10000000-0000-4000-8000-000000000010'$$,
  'admin can update film_genres'
);
select lives_ok(
  $$update public.film_metrics set wig = 3 where film_id = '10000000-0000-4000-8000-000000000010'$$,
  'admin can update film_metrics'
);
select lives_ok(
  $$update public.tags set kind = 'running_gag' where id = '30000000-0000-4000-8000-000000000010'$$,
  'admin can update tags'
);
select lives_ok(
  $$update public.film_tags set created_at = created_at where film_id = '10000000-0000-4000-8000-000000000010'$$,
  'admin can update film_tags'
);
select lives_ok(
  $$update public.film_scores set imdb_score = 6.6 where id = '40000000-0000-4000-8000-000000000010'$$,
  'admin can update a sourced film score'
);
select lives_ok(
  $$update public.editorial_content set body = 'Updated body' where id = '50000000-0000-4000-8000-000000000010'$$,
  'admin can update editorial content'
);
select lives_ok(
  $$update public.upcoming_releases set status_label = 'Updated' where id = '60000000-0000-4000-8000-000000000010'$$,
  'admin can update upcoming releases'
);
select lives_ok(
  $$update public.film_connections set description = 'Updated' where id = '70000000-0000-4000-8000-000000000010'$$,
  'admin can update film connections'
);

-- Storage metadata is touched only inside this rollback-only policy test.
-- Real uploads, updates, and deletes must use the Storage API.
select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('film-posters', '10000000-0000-4000-8000-000000000001/admin-test.jpg')$$,
  'admin poster insert policy accepts a safe object path'
);
select lives_ok(
  $$update storage.objects set metadata = '{"mimetype":"image/jpeg","size":1}'::jsonb where bucket_id = 'film-posters' and name = '10000000-0000-4000-8000-000000000001/admin-test.jpg'$$,
  'admin poster update policy succeeds'
);
select lives_ok(
  $$delete from storage.objects where bucket_id = 'film-posters' and name = '10000000-0000-4000-8000-000000000001/admin-test.jpg'$$,
  'admin poster delete policy succeeds'
);

select lives_ok(
  $$delete from public.film_connections where id = '70000000-0000-4000-8000-000000000010'$$,
  'admin can delete film connections'
);
select lives_ok(
  $$delete from public.upcoming_releases where id = '60000000-0000-4000-8000-000000000010'$$,
  'admin can delete upcoming releases'
);
select lives_ok(
  $$delete from public.editorial_content where id = '50000000-0000-4000-8000-000000000010'$$,
  'admin can delete editorial content'
);
select lives_ok(
  $$delete from public.film_scores where id = '40000000-0000-4000-8000-000000000010'$$,
  'admin can delete film_scores'
);
select lives_ok(
  $$delete from public.film_tags where film_id = '10000000-0000-4000-8000-000000000010' and tag_id = '30000000-0000-4000-8000-000000000010'$$,
  'admin can delete film_tags'
);
select lives_ok(
  $$delete from public.tags where id = '30000000-0000-4000-8000-000000000010'$$,
  'admin can delete tags'
);
select lives_ok(
  $$delete from public.film_metrics where film_id = '10000000-0000-4000-8000-000000000010'$$,
  'admin can delete film_metrics'
);
select lives_ok(
  $$delete from public.film_genres where film_id = '10000000-0000-4000-8000-000000000010' and genre_id = '20000000-0000-4000-8000-000000000010'$$,
  'admin can delete film_genres'
);
select lives_ok(
  $$delete from public.genres where id = '20000000-0000-4000-8000-000000000010'$$,
  'admin can delete genres'
);
select lives_ok(
  $$delete from public.films where id = '10000000-0000-4000-8000-000000000010'$$,
  'admin can delete films'
);

reset role;

select * from finish(true);
rollback;
