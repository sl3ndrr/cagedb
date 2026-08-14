-- supabase/migrations/20260814000500_grants_and_rls.sql
begin;

-- Prevent arbitrary object creation in the exposed schema.
revoke create on schema public from public;
grant usage on schema public to anon, authenticated, service_role;

-- Explicit object privileges. RLS provides the row-level boundary.
revoke all on table public.films from anon, authenticated;
revoke all on table public.genres from anon, authenticated;
revoke all on table public.film_genres from anon, authenticated;
revoke all on table public.film_metrics from anon, authenticated;
revoke all on table public.tags from anon, authenticated;
revoke all on table public.film_tags from anon, authenticated;
revoke all on table public.film_scores from anon, authenticated;
revoke all on table public.editorial_content from anon, authenticated;
revoke all on table public.upcoming_releases from anon, authenticated;
revoke all on table public.film_connections from anon, authenticated;

grant select on table
  public.films,
  public.genres,
  public.film_genres,
  public.film_metrics,
  public.tags,
  public.film_tags,
  public.film_scores,
  public.editorial_content,
  public.upcoming_releases,
  public.film_connections
to anon, authenticated;

grant insert, update, delete on table
  public.films,
  public.genres,
  public.film_genres,
  public.film_metrics,
  public.tags,
  public.film_tags,
  public.film_scores,
  public.editorial_content,
  public.upcoming_releases,
  public.film_connections
to authenticated;

grant select, insert, update, delete on table
  public.films,
  public.genres,
  public.film_genres,
  public.film_metrics,
  public.tags,
  public.film_tags,
  public.film_scores,
  public.editorial_content,
  public.upcoming_releases,
  public.film_connections
to service_role;

alter table public.films enable row level security;
alter table public.films force row level security;
alter table public.genres enable row level security;
alter table public.genres force row level security;
alter table public.film_genres enable row level security;
alter table public.film_genres force row level security;
alter table public.film_metrics enable row level security;
alter table public.film_metrics force row level security;
alter table public.tags enable row level security;
alter table public.tags force row level security;
alter table public.film_tags enable row level security;
alter table public.film_tags force row level security;
alter table public.film_scores enable row level security;
alter table public.film_scores force row level security;
alter table public.editorial_content enable row level security;
alter table public.editorial_content force row level security;
alter table public.upcoming_releases enable row level security;
alter table public.upcoming_releases force row level security;
alter table public.film_connections enable row level security;
alter table public.film_connections force row level security;

-- films
drop policy if exists films_public_read on public.films;
create policy films_public_read
on public.films
for select
to anon, authenticated
using (published);

drop policy if exists films_admin_all on public.films;
create policy films_admin_all
on public.films
for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

-- genres
drop policy if exists genres_public_read on public.genres;
create policy genres_public_read
on public.genres
for select
to anon, authenticated
using (published);

drop policy if exists genres_admin_all on public.genres;
create policy genres_admin_all
on public.genres
for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

-- film_genres
drop policy if exists film_genres_public_read on public.film_genres;
create policy film_genres_public_read
on public.film_genres
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.films as film
    where film.id = film_genres.film_id
      and film.published
  )
  and exists (
    select 1
    from public.genres as genre
    where genre.id = film_genres.genre_id
      and genre.published
  )
);

drop policy if exists film_genres_admin_all on public.film_genres;
create policy film_genres_admin_all
on public.film_genres
for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

-- film_metrics
drop policy if exists film_metrics_public_read on public.film_metrics;
create policy film_metrics_public_read
on public.film_metrics
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.films as film
    where film.id = film_metrics.film_id
      and film.published
  )
);

drop policy if exists film_metrics_admin_all on public.film_metrics;
create policy film_metrics_admin_all
on public.film_metrics
for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

-- tags
drop policy if exists tags_public_read on public.tags;
create policy tags_public_read
on public.tags
for select
to anon, authenticated
using (published);

drop policy if exists tags_admin_all on public.tags;
create policy tags_admin_all
on public.tags
for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

-- film_tags
drop policy if exists film_tags_public_read on public.film_tags;
create policy film_tags_public_read
on public.film_tags
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.films as film
    where film.id = film_tags.film_id
      and film.published
  )
  and exists (
    select 1
    from public.tags as tag
    where tag.id = film_tags.tag_id
      and tag.published
  )
);

drop policy if exists film_tags_admin_all on public.film_tags;
create policy film_tags_admin_all
on public.film_tags
for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

-- film_scores: imported legacy rows may be incomplete, but only sourced rows are public.
drop policy if exists film_scores_public_read on public.film_scores;
create policy film_scores_public_read
on public.film_scores
for select
to anon, authenticated
using (
  source_url is not null
  and btrim(source_url) <> ''
  and retrieved_at is not null
  and exists (
    select 1
    from public.films as film
    where film.id = film_scores.film_id
      and film.published
  )
);

drop policy if exists film_scores_admin_read on public.film_scores;
create policy film_scores_admin_read
on public.film_scores
for select
to authenticated
using ((select public.is_admin()));

drop policy if exists film_scores_admin_insert_verified on public.film_scores;
create policy film_scores_admin_insert_verified
on public.film_scores
for insert
to authenticated
with check (
  (select public.is_admin())
  and source_url is not null
  and btrim(source_url) <> ''
  and retrieved_at is not null
);

drop policy if exists film_scores_admin_update_verified on public.film_scores;
create policy film_scores_admin_update_verified
on public.film_scores
for update
to authenticated
using ((select public.is_admin()))
with check (
  (select public.is_admin())
  and source_url is not null
  and btrim(source_url) <> ''
  and retrieved_at is not null
);

drop policy if exists film_scores_admin_delete on public.film_scores;
create policy film_scores_admin_delete
on public.film_scores
for delete
to authenticated
using ((select public.is_admin()));

-- editorial_content
drop policy if exists editorial_content_public_read on public.editorial_content;
create policy editorial_content_public_read
on public.editorial_content
for select
to anon, authenticated
using (published);

drop policy if exists editorial_content_admin_all on public.editorial_content;
create policy editorial_content_admin_all
on public.editorial_content
for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

-- upcoming_releases
drop policy if exists upcoming_releases_public_read on public.upcoming_releases;
create policy upcoming_releases_public_read
on public.upcoming_releases
for select
to anon, authenticated
using (published);

drop policy if exists upcoming_releases_admin_all on public.upcoming_releases;
create policy upcoming_releases_admin_all
on public.upcoming_releases
for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

-- film_connections
drop policy if exists film_connections_public_read on public.film_connections;
create policy film_connections_public_read
on public.film_connections
for select
to anon, authenticated
using (
  published
  and exists (
    select 1
    from public.films as source_film
    where source_film.id = film_connections.source_film_id
      and source_film.published
  )
  and exists (
    select 1
    from public.films as target_film
    where target_film.id = film_connections.target_film_id
      and target_film.published
  )
);

drop policy if exists film_connections_admin_all on public.film_connections;
create policy film_connections_admin_all
on public.film_connections
for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

commit;
