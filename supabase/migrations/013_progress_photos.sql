-- ==================================================================
-- 013_progress_photos.sql
-- Private before/after progress photos (front · side · back).
-- Storage: private bucket. RLS: owner + admin read; owner write.
-- ==================================================================

create table if not exists public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  phase text not null check (phase in ('before', 'after')),
  pose text not null check (pose in ('front', 'side', 'back')),
  storage_path text not null,
  updated_at timestamptz not null default now(),
  unique (profile_id, phase, pose)
);

create index if not exists progress_photos_profile_idx
  on public.progress_photos (profile_id);

comment on table public.progress_photos is
  'Fixed-slot progress photos (before/after × front/side/back). Files live in private storage bucket progress-photos.';

alter table public.progress_photos enable row level security;

drop policy if exists "progress_photos_select_own_or_admin" on public.progress_photos;
create policy "progress_photos_select_own_or_admin"
  on public.progress_photos for select
  to authenticated
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists "progress_photos_insert_own" on public.progress_photos;
create policy "progress_photos_insert_own"
  on public.progress_photos for insert
  to authenticated
  with check (profile_id = auth.uid());

drop policy if exists "progress_photos_update_own" on public.progress_photos;
create policy "progress_photos_update_own"
  on public.progress_photos for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists "progress_photos_delete_own" on public.progress_photos;
create policy "progress_photos_delete_own"
  on public.progress_photos for delete
  to authenticated
  using (profile_id = auth.uid());

-- Private bucket (2 MB cap; client compresses to JPEG before upload)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'progress-photos',
  'progress-photos',
  false,
  2097152,
  array['image/jpeg']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Path layout: {user_id}/{phase}/{pose}.jpg
drop policy if exists "progress_photos_storage_select" on storage.objects;
create policy "progress_photos_storage_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'progress-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

drop policy if exists "progress_photos_storage_insert" on storage.objects;
create policy "progress_photos_storage_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "progress_photos_storage_update" on storage.objects;
create policy "progress_photos_storage_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "progress_photos_storage_delete" on storage.objects;
create policy "progress_photos_storage_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
