-- supabase/migrations/20260814000200_catalog_schema.sql
begin;

create table if not exists public.films (
  id uuid primary key default gen_random_uuid(),
  legacy_import_id text unique,
  release_year smallint,
  original_title text not null,
  german_title text,
  display_title text generated always as (
    case
      when german_title is null or btrim(german_title) = '' then btrim(original_title)
      when left(btrim(german_title), 1) in ('-', '–', '—')
        then btrim(original_title) || ' ' || btrim(german_title)
      else btrim(german_title)
    end
  ) stored,
  my_rating_percent smallint,
  watched boolean generated always as (my_rating_percent is not null) stored,
  notes text,
  poster_path text,
  watchlist_priority integer,
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint films_legacy_import_id_not_blank check (
    legacy_import_id is null or btrim(legacy_import_id) <> ''
  ),
  constraint films_release_year_range check (
    release_year is null or release_year between 1888 and 2200
  ),
  constraint films_original_title_not_blank check (btrim(original_title) <> ''),
  constraint films_german_title_not_blank check (
    german_title is null or btrim(german_title) <> ''
  ),
  constraint films_rating_range check (
    my_rating_percent is null or my_rating_percent between 0 and 100
  ),
  constraint films_poster_path_not_blank check (
    poster_path is null or btrim(poster_path) <> ''
  ),
  constraint films_watchlist_priority_positive check (
    watchlist_priority is null or watchlist_priority >= 1
  ),
  constraint films_watched_has_no_watchlist_priority check (
    my_rating_percent is null or watchlist_priority is null
  ),
  constraint films_published_at_consistent check (
    published_at is null or published
  )
);

comment on table public.films is 'Canonical CageDB film records.';
comment on column public.films.legacy_import_id is
  'External source identifier used for idempotent imports; never the primary key.';
comment on column public.films.german_title is
  'Raw imported or manually edited German title. Leading-dash fragments remain unchanged.';
comment on column public.films.display_title is
  'Generated German-first display title with safe fallback and fragment composition.';
comment on column public.films.my_rating_percent is
  'Only source of truth for watched state. NULL means watchlist.';
comment on column public.films.watched is
  'Generated from my_rating_percent and cannot be edited independently.';
comment on column public.films.poster_path is
  'Object path inside the film-posters Storage bucket, not an arbitrary external URL.';

create table if not exists public.genres (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  accent_color text,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint genres_name_not_blank check (btrim(name) <> ''),
  constraint genres_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint genres_accent_color_format check (
    accent_color is null or accent_color ~ '^#[0-9A-Fa-f]{6}$'
  )
);

create unique index if not exists genres_name_ci_key
  on public.genres (lower(btrim(name)));

comment on table public.genres is
  'Editable genre lookup. Missing film_genres rows represent Ohne Genre.';

create table if not exists public.film_genres (
  film_id uuid not null references public.films (id) on delete cascade,
  genre_id uuid not null references public.genres (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (film_id, genre_id)
);

create index if not exists film_genres_genre_id_idx
  on public.film_genres (genre_id);

create table if not exists public.film_metrics (
  film_id uuid primary key references public.films (id) on delete cascade,
  wig smallint,
  scream_intensity smallint,
  explosions smallint,
  overacting_level smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint film_metrics_wig_range check (wig is null or wig between 0 and 5),
  constraint film_metrics_scream_range check (
    scream_intensity is null or scream_intensity between 0 and 5
  ),
  constraint film_metrics_explosions_range check (
    explosions is null or explosions between 0 and 5
  ),
  constraint film_metrics_overacting_range check (
    overacting_level is null or overacting_level between 0 and 5
  )
);

comment on table public.film_metrics is
  'Nullable 0-5 Cage-o-meter metrics. NULL means not assessed; zero is a real assessment.';

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  kind text not null default 'general',
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tags_name_not_blank check (btrim(name) <> ''),
  constraint tags_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint tags_kind_allowed check (kind in ('general', 'running_gag'))
);

create unique index if not exists tags_name_kind_ci_key
  on public.tags (lower(btrim(name)), kind);

create table if not exists public.film_tags (
  film_id uuid not null references public.films (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (film_id, tag_id)
);

create index if not exists film_tags_tag_id_idx
  on public.film_tags (tag_id);

create table if not exists public.film_scores (
  id uuid primary key default gen_random_uuid(),
  film_id uuid not null references public.films (id) on delete cascade,
  provider text not null,
  rt_tomatometer_percent smallint,
  rt_audience_percent smallint,
  imdb_score numeric(3, 1),
  source_url text,
  retrieved_at date,
  source_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint film_scores_film_provider_key unique (film_id, provider),
  constraint film_scores_provider_allowed check (
    provider in ('rotten_tomatoes', 'imdb')
  ),
  constraint film_scores_rt_tomatometer_range check (
    rt_tomatometer_percent is null or rt_tomatometer_percent between 0 and 100
  ),
  constraint film_scores_rt_audience_range check (
    rt_audience_percent is null or rt_audience_percent between 0 and 100
  ),
  constraint film_scores_imdb_range check (
    imdb_score is null or imdb_score between 0.0 and 10.0
  ),
  constraint film_scores_provider_payload check (
    (
      provider = 'rotten_tomatoes'
      and imdb_score is null
      and (rt_tomatometer_percent is not null or rt_audience_percent is not null)
    )
    or
    (
      provider = 'imdb'
      and rt_tomatometer_percent is null
      and rt_audience_percent is null
      and imdb_score is not null
    )
  ),
  constraint film_scores_source_url_https check (
    source_url is null or source_url ~* '^https://[^[:space:]]+$'
  ),
  constraint film_scores_source_note_not_blank check (
    source_note is null or btrim(source_note) <> ''
  )
);

comment on table public.film_scores is
  'Provider-specific external scores. Public RLS also requires source_url and retrieved_at.';
comment on column public.film_scores.source_note is
  'Optional provenance note such as legacy import context; never a substitute for source_url.';

create index if not exists films_public_filters_idx
  on public.films (published, watched, release_year);
create index if not exists films_public_rating_idx
  on public.films (my_rating_percent)
  where published;
create index if not exists films_watchlist_priority_idx
  on public.films (watchlist_priority, id)
  where my_rating_percent is null;
create index if not exists film_scores_film_id_idx
  on public.film_scores (film_id);

commit;
