-- ==================================================================
-- 034_monday_voice_drops.sql
-- Weekly Callie PSA voice drop — one audio object, Today banner only
-- (not fan-out into Messages threads).
-- ==================================================================

create table if not exists public.voice_drops (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  caption text not null default '',
  audio_path text not null,
  audio_mime text not null,
  audio_bytes integer,
  duration_ms integer,
  audience text not null default 'admins'
    check (audience in ('admins', 'active', 'all_mamas')),
  status text not null default 'published'
    check (status in ('published', 'superseded', 'retracted')),
  published_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint voice_drops_caption_len check (char_length(caption) <= 500),
  constraint voice_drops_audio_path_len check (char_length(trim(audio_path)) between 1 and 500),
  constraint voice_drops_audio_mime_audio check (audio_mime ~* '^audio/')
);

create index if not exists voice_drops_current_idx
  on public.voice_drops (published_at desc)
  where status = 'published';

comment on table public.voice_drops is
  'Monday Callie voice PSA — single Storage object; shown on Today until expiry/supersede.';

alter table public.voice_drops enable row level security;

-- Admins manage all rows.
drop policy if exists "voice_drops_admin_all" on public.voice_drops;
create policy "voice_drops_admin_all"
  on public.voice_drops for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Eligible readers see the current published, non-expired drop for their audience.
drop policy if exists "voice_drops_select_audience" on public.voice_drops;
create policy "voice_drops_select_audience"
  on public.voice_drops for select to authenticated
  using (
    status = 'published'
    and expires_at > now()
    and (
      public.is_admin()
      or (
        audience = 'active'
        and exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and coalesce(p.refunded, false) = false
            and p.status = 'active'
        )
      )
      or (
        audience = 'all_mamas'
        and exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and coalesce(p.refunded, false) = false
            and coalesce(p.role, '') <> 'admin'
        )
      )
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'voice-drops',
  'voice-drops',
  false,
  10485760,
  array[
    'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/x-m4a', 'audio/aac'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Path: {drop_or_upload_id}/{filename} — admins write; eligible users read via signed URLs
-- (select allowed for anyone who can see the matching voice_drops row is hard in storage RLS,
--  so authenticated readers may select; app only signs URLs after voice_drops SELECT succeeds).
drop policy if exists "voice_drops_storage_insert" on storage.objects;
create policy "voice_drops_storage_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'voice-drops' and public.is_admin());

drop policy if exists "voice_drops_storage_select" on storage.objects;
create policy "voice_drops_storage_select"
  on storage.objects for select to authenticated
  using (bucket_id = 'voice-drops');

drop policy if exists "voice_drops_storage_delete" on storage.objects;
create policy "voice_drops_storage_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'voice-drops' and public.is_admin());
