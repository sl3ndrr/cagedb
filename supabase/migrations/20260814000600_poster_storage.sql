-- supabase/migrations/20260814000600_poster_storage.sql
begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'film-posters',
  'film-posters',
  true,
  8388608,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/avif'
  ]::text[]
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public buckets can serve known object URLs without a SELECT policy.
-- Admin SELECT is needed for listing and managing objects in the dashboard/UI.
drop policy if exists film_posters_admin_select on storage.objects;
create policy film_posters_admin_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'film-posters'
  and (select public.is_admin())
);

drop policy if exists film_posters_admin_insert on storage.objects;
create policy film_posters_admin_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'film-posters'
  and (select public.is_admin())
  and lower(storage.extension(name)) = any (
    array['jpg', 'jpeg', 'png', 'webp', 'avif']::text[]
  )
  and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[a-z0-9][a-z0-9._-]*\.(jpe?g|png|webp|avif)$'
);

drop policy if exists film_posters_admin_update on storage.objects;
create policy film_posters_admin_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'film-posters'
  and (select public.is_admin())
)
with check (
  bucket_id = 'film-posters'
  and (select public.is_admin())
  and lower(storage.extension(name)) = any (
    array['jpg', 'jpeg', 'png', 'webp', 'avif']::text[]
  )
  and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[a-z0-9][a-z0-9._-]*\.(jpe?g|png|webp|avif)$'
);

drop policy if exists film_posters_admin_delete on storage.objects;
create policy film_posters_admin_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'film-posters'
  and (select public.is_admin())
);

commit;
