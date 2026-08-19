-- Isolated CI schema: production-shaped voice_drops + the live-wide
-- storage SELECT from 034. The production tightening migration runs
-- after this file so the pgTAP test covers the applied policy, not a
-- hand-copied stand-in.

alter table public.profiles
  add column if not exists refunded boolean not null default false,
  add column if not exists cohort_label text;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

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
  cohort_label text,
  status text not null default 'published'
    check (status in ('published', 'superseded', 'retracted')),
  published_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.voice_drops enable row level security;

drop policy if exists "voice_drops_admin_all" on public.voice_drops;
create policy "voice_drops_admin_all"
  on public.voice_drops for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

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
            and (
              voice_drops.cohort_label is null
              or voice_drops.cohort_label = p.cohort_label
            )
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

grant select, insert, update, delete on table public.voice_drops to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'voice-drops',
  'voice-drops',
  false,
  52428800,
  array[
    'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/x-m4a', 'audio/aac'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Live-wide SELECT (034). Tightened by 20260819050000_*.
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
