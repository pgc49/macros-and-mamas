-- Auth-only support uploads: signed-in mamas can write media to their own folder.
-- Run after 021_support_reports.sql.

-- Allow larger screen recordings (phone screen recordings are often 10–40 MB).
update storage.buckets
set
  file_size_limit = 52428800, -- 50 MB
  allowed_mime_types = array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif',
    'video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'
  ]
where id = 'support-screenshots';

-- Clients may upload/read only under {auth.uid()}/...
drop policy if exists "support_media_insert_own" on storage.objects;
create policy "support_media_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'support-screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "support_media_select_own" on storage.objects;
create policy "support_media_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'support-screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Admins can view all support media when investigating.
drop policy if exists "support_media_select_admin" on storage.objects;
create policy "support_media_select_admin"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'support-screenshots'
    and public.is_admin()
  );
