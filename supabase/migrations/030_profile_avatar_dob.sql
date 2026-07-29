-- ==================================================================
-- 030_profile_avatar_dob.sql
-- Account page foundations: optional avatar + date of birth
-- ==================================================================

alter table public.profiles
  add column if not exists avatar_path text,
  add column if not exists date_of_birth date;

comment on column public.profiles.avatar_path is
  'Path in avatars bucket: {profile_id}/avatar.{ext}. Null = no photo.';
comment on column public.profiles.date_of_birth is
  'Optional DOB. When set, age is derived for macro math; age column kept in sync.';

alter table public.profiles drop constraint if exists profiles_avatar_path_check;
alter table public.profiles
  add constraint profiles_avatar_path_check check (
    avatar_path is null
    or (
      char_length(trim(avatar_path)) between 1 and 400
      and avatar_path like (id::text || '/%')
    )
  );

-- Public-read avatars (path still scoped to own folder for writes).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars_select_public" on storage.objects;
create policy "avatars_select_public"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
