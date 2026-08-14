-- supabase/migrations/20260814000300_editorial_schema.sql
begin;

create table if not exists public.editorial_content (
  id uuid primary key default gen_random_uuid(),
  content_type text not null,
  title text,
  body text not null,
  quote_attribution text,
  event_date date,
  event_year smallint,
  sort_order integer not null default 0,
  source_label text,
  source_url text,
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint editorial_content_type_allowed check (
    content_type in ('biography', 'timeline', 'fact', 'quote')
  ),
  constraint editorial_content_title_not_blank check (
    title is null or btrim(title) <> ''
  ),
  constraint editorial_content_body_not_blank check (btrim(body) <> ''),
  constraint editorial_content_quote_attribution check (
    content_type <> 'quote'
    or (quote_attribution is not null and btrim(quote_attribution) <> '')
  ),
  constraint editorial_content_fact_quote_source check (
    content_type not in ('fact', 'quote')
    or (source_label is not null and btrim(source_label) <> '')
  ),
  constraint editorial_content_timeline_date check (
    content_type <> 'timeline' or event_date is not null or event_year is not null
  ),
  constraint editorial_content_event_year_range check (
    event_year is null or event_year between 1800 and 2200
  ),
  constraint editorial_content_event_date_year_match check (
    event_date is null
    or event_year is null
    or extract(year from event_date)::smallint = event_year
  ),
  constraint editorial_content_source_url_https check (
    source_url is null or source_url ~* '^https://[^[:space:]]+$'
  ),
  constraint editorial_content_published_at_consistent check (
    published_at is null or published
  )
);

comment on table public.editorial_content is
  'Biography, timeline, sourced facts, and sourced quotes.';

create table if not exists public.upcoming_releases (
  id uuid primary key default gen_random_uuid(),
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
  role_name text,
  expected_release_date date,
  expected_release_window text,
  status_label text,
  notes text,
  source_label text not null,
  source_url text,
  source_checked_at date not null,
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint upcoming_releases_original_title_not_blank check (
    btrim(original_title) <> ''
  ),
  constraint upcoming_releases_german_title_not_blank check (
    german_title is null or btrim(german_title) <> ''
  ),
  constraint upcoming_releases_role_name_not_blank check (
    role_name is null or btrim(role_name) <> ''
  ),
  constraint upcoming_releases_window_not_blank check (
    expected_release_window is null or btrim(expected_release_window) <> ''
  ),
  constraint upcoming_releases_status_not_blank check (
    status_label is null or btrim(status_label) <> ''
  ),
  constraint upcoming_releases_source_label_not_blank check (
    btrim(source_label) <> ''
  ),
  constraint upcoming_releases_source_url_https check (
    source_url is null or source_url ~* '^https://[^[:space:]]+$'
  ),
  constraint upcoming_releases_published_at_consistent check (
    published_at is null or published
  )
);

comment on table public.upcoming_releases is
  'Sourced future releases. No row should be created from speculation.';

create table if not exists public.film_connections (
  id uuid primary key default gen_random_uuid(),
  source_film_id uuid not null references public.films (id) on delete cascade,
  target_film_id uuid not null references public.films (id) on delete cascade,
  connection_type text not null,
  description text,
  source_label text not null,
  source_url text,
  source_checked_at date,
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint film_connections_unique_link unique (
    source_film_id,
    target_film_id,
    connection_type
  ),
  constraint film_connections_distinct_films check (
    source_film_id <> target_film_id
  ),
  constraint film_connections_type_not_blank check (
    btrim(connection_type) <> ''
  ),
  constraint film_connections_description_not_blank check (
    description is null or btrim(description) <> ''
  ),
  constraint film_connections_source_label_not_blank check (
    btrim(source_label) <> ''
  ),
  constraint film_connections_source_url_https check (
    source_url is null or source_url ~* '^https://[^[:space:]]+$'
  ),
  constraint film_connections_published_at_consistent check (
    published_at is null or published
  )
);

comment on table public.film_connections is
  'Sourced links used by the Cage Cinematic Universe graph and list views.';

create index if not exists editorial_content_public_order_idx
  on public.editorial_content (published, content_type, sort_order);
create index if not exists upcoming_releases_public_date_idx
  on public.upcoming_releases (published, expected_release_date);
create index if not exists film_connections_source_idx
  on public.film_connections (source_film_id);
create index if not exists film_connections_target_idx
  on public.film_connections (target_film_id);

commit;
