-- supabase/migrations/20260814000400_triggers.sql
begin;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.sync_published_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.published then
    if tg_op = 'INSERT' then
      new.published_at := coalesce(new.published_at, now());
    elsif old.published is distinct from true then
      new.published_at := coalesce(new.published_at, now());
    end if;
  else
    new.published_at := null;
  end if;

  return new;
end;
$$;

create or replace function public.normalize_film_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- A personal rating is the sole source of truth for watched state.
  if new.my_rating_percent is not null then
    new.watchlist_priority := null;
  end if;

  return new;
end;
$$;

revoke all on function public.set_updated_at() from public;
revoke all on function public.sync_published_at() from public;
revoke all on function public.normalize_film_state() from public;

drop trigger if exists films_set_updated_at on public.films;
create trigger films_set_updated_at
before update on public.films
for each row execute function public.set_updated_at();

drop trigger if exists films_sync_published_at on public.films;
create trigger films_sync_published_at
before insert or update of published, published_at on public.films
for each row execute function public.sync_published_at();

drop trigger if exists films_normalize_state on public.films;
create trigger films_normalize_state
before insert or update of my_rating_percent, watchlist_priority on public.films
for each row execute function public.normalize_film_state();

drop trigger if exists genres_set_updated_at on public.genres;
create trigger genres_set_updated_at
before update on public.genres
for each row execute function public.set_updated_at();

drop trigger if exists film_metrics_set_updated_at on public.film_metrics;
create trigger film_metrics_set_updated_at
before update on public.film_metrics
for each row execute function public.set_updated_at();

drop trigger if exists tags_set_updated_at on public.tags;
create trigger tags_set_updated_at
before update on public.tags
for each row execute function public.set_updated_at();

drop trigger if exists film_scores_set_updated_at on public.film_scores;
create trigger film_scores_set_updated_at
before update on public.film_scores
for each row execute function public.set_updated_at();

drop trigger if exists editorial_content_set_updated_at on public.editorial_content;
create trigger editorial_content_set_updated_at
before update on public.editorial_content
for each row execute function public.set_updated_at();

drop trigger if exists editorial_content_sync_published_at on public.editorial_content;
create trigger editorial_content_sync_published_at
before insert or update of published, published_at on public.editorial_content
for each row execute function public.sync_published_at();

drop trigger if exists upcoming_releases_set_updated_at on public.upcoming_releases;
create trigger upcoming_releases_set_updated_at
before update on public.upcoming_releases
for each row execute function public.set_updated_at();

drop trigger if exists upcoming_releases_sync_published_at on public.upcoming_releases;
create trigger upcoming_releases_sync_published_at
before insert or update of published, published_at on public.upcoming_releases
for each row execute function public.sync_published_at();

drop trigger if exists film_connections_set_updated_at on public.film_connections;
create trigger film_connections_set_updated_at
before update on public.film_connections
for each row execute function public.set_updated_at();

drop trigger if exists film_connections_sync_published_at on public.film_connections;
create trigger film_connections_sync_published_at
before insert or update of published, published_at on public.film_connections
for each row execute function public.sync_published_at();

commit;
