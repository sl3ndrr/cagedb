-- supabase/migrations/20260814000700_initial_import_rpc.sql
begin;

create or replace function public.import_initial_films(p_films jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_allowed_keys constant text[] := array[
    'legacy_import_id',
    'release_year',
    'original_title',
    'german_title',
    'my_rating_percent',
    'rt_tomatometer_percent',
    'rt_audience_percent',
    'imdb_score'
  ];
  v_item jsonb;
  v_index integer := 0;
  v_total integer;
  v_existing integer;
  v_inserted integer;
  v_rt_applied integer := 0;
  v_imdb_applied integer := 0;
  v_scores_removed integer := 0;
  v_last_row_count integer := 0;
begin
  if p_films is null or jsonb_typeof(p_films) <> 'array' then
    raise exception using
      errcode = '22023',
      message = 'p_films must be a JSON array.';
  end if;

  v_total := jsonb_array_length(p_films);

  if v_total < 1 or v_total > 500 then
    raise exception using
      errcode = '22023',
      message = 'p_films must contain between 1 and 500 rows.';
  end if;

  for v_item in
    select source.item
    from jsonb_array_elements(p_films) as source(item)
  loop
    v_index := v_index + 1;

    if jsonb_typeof(v_item) <> 'object' then
      raise exception using
        errcode = '22023',
        message = format('Import row %s must be a JSON object.', v_index);
    end if;

    if not (v_item ?& v_allowed_keys) then
      raise exception using
        errcode = '22023',
        message = format('Import row %s does not contain the complete field whitelist.', v_index);
    end if;

    if (v_item - v_allowed_keys) <> '{}'::jsonb then
      raise exception using
        errcode = '22023',
        message = format('Import row %s contains non-whitelisted fields.', v_index);
    end if;

    if jsonb_typeof(v_item -> 'legacy_import_id') <> 'string'
      or btrim(v_item ->> 'legacy_import_id') = '' then
      raise exception using
        errcode = '22023',
        message = format('Import row %s has an invalid legacy_import_id.', v_index);
    end if;

    if jsonb_typeof(v_item -> 'original_title') <> 'string'
      or btrim(v_item ->> 'original_title') = '' then
      raise exception using
        errcode = '22023',
        message = format('Import row %s has an invalid original_title.', v_index);
    end if;

    if jsonb_typeof(v_item -> 'german_title') not in ('string', 'null')
      or (
        jsonb_typeof(v_item -> 'german_title') = 'string'
        and btrim(v_item ->> 'german_title') = ''
      ) then
      raise exception using
        errcode = '22023',
        message = format('Import row %s has an invalid german_title.', v_index);
    end if;

    if jsonb_typeof(v_item -> 'release_year') not in ('number', 'null')
      or (
        jsonb_typeof(v_item -> 'release_year') = 'number'
        and (
          (v_item ->> 'release_year')::numeric <> trunc((v_item ->> 'release_year')::numeric)
          or (v_item ->> 'release_year')::numeric not between 1888 and 2200
        )
      ) then
      raise exception using
        errcode = '22023',
        message = format('Import row %s has an invalid release_year.', v_index);
    end if;

    if jsonb_typeof(v_item -> 'my_rating_percent') not in ('number', 'null')
      or (
        jsonb_typeof(v_item -> 'my_rating_percent') = 'number'
        and (
          (v_item ->> 'my_rating_percent')::numeric
            <> trunc((v_item ->> 'my_rating_percent')::numeric)
          or (v_item ->> 'my_rating_percent')::numeric not between 0 and 100
        )
      ) then
      raise exception using
        errcode = '22023',
        message = format('Import row %s has an invalid my_rating_percent.', v_index);
    end if;

    if jsonb_typeof(v_item -> 'rt_tomatometer_percent') not in ('number', 'null')
      or (
        jsonb_typeof(v_item -> 'rt_tomatometer_percent') = 'number'
        and (
          (v_item ->> 'rt_tomatometer_percent')::numeric
            <> trunc((v_item ->> 'rt_tomatometer_percent')::numeric)
          or (v_item ->> 'rt_tomatometer_percent')::numeric not between 0 and 100
        )
      ) then
      raise exception using
        errcode = '22023',
        message = format('Import row %s has an invalid rt_tomatometer_percent.', v_index);
    end if;

    if jsonb_typeof(v_item -> 'rt_audience_percent') not in ('number', 'null')
      or (
        jsonb_typeof(v_item -> 'rt_audience_percent') = 'number'
        and (
          (v_item ->> 'rt_audience_percent')::numeric
            <> trunc((v_item ->> 'rt_audience_percent')::numeric)
          or (v_item ->> 'rt_audience_percent')::numeric not between 0 and 100
        )
      ) then
      raise exception using
        errcode = '22023',
        message = format('Import row %s has an invalid rt_audience_percent.', v_index);
    end if;

    if jsonb_typeof(v_item -> 'imdb_score') not in ('number', 'null')
      or (
        jsonb_typeof(v_item -> 'imdb_score') = 'number'
        and (
          (v_item ->> 'imdb_score')::numeric not between 0 and 10
          or mod((v_item ->> 'imdb_score')::numeric * 10, 1) <> 0
        )
      ) then
      raise exception using
        errcode = '22023',
        message = format('Import row %s has an invalid imdb_score.', v_index);
    end if;
  end loop;

  if exists (
    select 1
    from jsonb_array_elements(p_films) as source(item)
    group by btrim(source.item ->> 'legacy_import_id')
    having count(*) > 1
  ) then
    raise exception using
      errcode = '22023',
      message = 'p_films contains duplicate legacy_import_id values.';
  end if;

  with source_rows as (
    select btrim(source.legacy_import_id) as legacy_import_id
    from jsonb_to_recordset(p_films) as source(
      legacy_import_id text,
      release_year smallint,
      original_title text,
      german_title text,
      my_rating_percent smallint,
      rt_tomatometer_percent smallint,
      rt_audience_percent smallint,
      imdb_score numeric(3, 1)
    )
  )
  select count(*)::integer
  into v_existing
  from source_rows
  join public.films as film using (legacy_import_id);

  v_inserted := v_total - v_existing;

  insert into public.films (
    legacy_import_id,
    release_year,
    original_title,
    german_title,
    my_rating_percent
  )
  select
    btrim(source.legacy_import_id),
    source.release_year,
    btrim(source.original_title),
    nullif(btrim(source.german_title), ''),
    source.my_rating_percent
  from jsonb_to_recordset(p_films) as source(
    legacy_import_id text,
    release_year smallint,
    original_title text,
    german_title text,
    my_rating_percent smallint,
    rt_tomatometer_percent smallint,
    rt_audience_percent smallint,
    imdb_score numeric(3, 1)
  )
  on conflict (legacy_import_id) do update
  set
    release_year = excluded.release_year,
    original_title = excluded.original_title,
    german_title = excluded.german_title,
    my_rating_percent = excluded.my_rating_percent;

  insert into public.film_scores (
    film_id,
    provider,
    rt_tomatometer_percent,
    rt_audience_percent,
    source_note
  )
  select
    film.id,
    'rotten_tomatoes',
    source.rt_tomatometer_percent,
    source.rt_audience_percent,
    'Legacy import supplied provider scores without a source URL or retrieval date.'
  from jsonb_to_recordset(p_films) as source(
    legacy_import_id text,
    release_year smallint,
    original_title text,
    german_title text,
    my_rating_percent smallint,
    rt_tomatometer_percent smallint,
    rt_audience_percent smallint,
    imdb_score numeric(3, 1)
  )
  join public.films as film
    on film.legacy_import_id = btrim(source.legacy_import_id)
  where source.rt_tomatometer_percent is not null
    or source.rt_audience_percent is not null
  on conflict (film_id, provider) do update
  set
    rt_tomatometer_percent = excluded.rt_tomatometer_percent,
    rt_audience_percent = excluded.rt_audience_percent,
    source_note = excluded.source_note
  where public.film_scores.source_url is null
    and public.film_scores.retrieved_at is null;

  get diagnostics v_rt_applied = row_count;

  insert into public.film_scores (
    film_id,
    provider,
    imdb_score,
    source_note
  )
  select
    film.id,
    'imdb',
    source.imdb_score,
    'Legacy import supplied a provider score without a source URL or retrieval date.'
  from jsonb_to_recordset(p_films) as source(
    legacy_import_id text,
    release_year smallint,
    original_title text,
    german_title text,
    my_rating_percent smallint,
    rt_tomatometer_percent smallint,
    rt_audience_percent smallint,
    imdb_score numeric(3, 1)
  )
  join public.films as film
    on film.legacy_import_id = btrim(source.legacy_import_id)
  where source.imdb_score is not null
  on conflict (film_id, provider) do update
  set
    imdb_score = excluded.imdb_score,
    source_note = excluded.source_note
  where public.film_scores.source_url is null
    and public.film_scores.retrieved_at is null;

  get diagnostics v_imdb_applied = row_count;

  delete from public.film_scores as score
  using public.films as film,
    jsonb_to_recordset(p_films) as source(
      legacy_import_id text,
      release_year smallint,
      original_title text,
      german_title text,
      my_rating_percent smallint,
      rt_tomatometer_percent smallint,
      rt_audience_percent smallint,
      imdb_score numeric(3, 1)
    )
  where score.film_id = film.id
    and film.legacy_import_id = btrim(source.legacy_import_id)
    and score.provider = 'rotten_tomatoes'
    and source.rt_tomatometer_percent is null
    and source.rt_audience_percent is null
    and score.source_url is null
    and score.retrieved_at is null;

  get diagnostics v_last_row_count = row_count;
  v_scores_removed := v_scores_removed + v_last_row_count;

  delete from public.film_scores as score
  using public.films as film,
    jsonb_to_recordset(p_films) as source(
      legacy_import_id text,
      release_year smallint,
      original_title text,
      german_title text,
      my_rating_percent smallint,
      rt_tomatometer_percent smallint,
      rt_audience_percent smallint,
      imdb_score numeric(3, 1)
    )
  where score.film_id = film.id
    and film.legacy_import_id = btrim(source.legacy_import_id)
    and score.provider = 'imdb'
    and source.imdb_score is null
    and score.source_url is null
    and score.retrieved_at is null;

  get diagnostics v_last_row_count = row_count;
  v_scores_removed := v_scores_removed + v_last_row_count;

  return jsonb_build_object(
    'films_received', v_total,
    'films_inserted', v_inserted,
    'films_updated', v_existing,
    'rt_score_rows_applied', v_rt_applied,
    'imdb_score_rows_applied', v_imdb_applied,
    'unverified_score_rows_removed', v_scores_removed,
    'published_by_import', 0
  );
end;
$$;

comment on function public.import_initial_films(jsonb) is
  'Atomic, idempotent initial film import. Execute only with a local service-role client.';

revoke all on function public.import_initial_films(jsonb) from public;
revoke all on function public.import_initial_films(jsonb) from anon, authenticated;
grant execute on function public.import_initial_films(jsonb) to service_role;

commit;
