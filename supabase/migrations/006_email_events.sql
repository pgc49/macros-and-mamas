-- Email send log for admin (Callie). Admin-only read. Service role writes.
-- Run this entire file in the Supabase SQL editor.

create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete set null,
  email_type text not null,
  to_email text,
  subject text,
  resend_id text,
  status text not null default 'sent',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.email_events is
  'Lifecycle email sends (Resend). Visible to admins only in the app.';

create index if not exists email_events_profile_created_idx
  on public.email_events (profile_id, created_at desc);

create index if not exists email_events_type_created_idx
  on public.email_events (email_type, created_at desc);

alter table public.email_events enable row level security;

-- Admins can read all email events
drop policy if exists "email_events_select_admin" on public.email_events;
create policy "email_events_select_admin"
  on public.email_events for select
  to authenticated
  using (public.is_admin());

-- No client inserts/updates via anon/authenticated — Cloudflare uses service role
-- (bypasses RLS). Keep insert locked down for JWT users.
drop policy if exists "email_events_insert_admin" on public.email_events;
create policy "email_events_insert_admin"
  on public.email_events for insert
  to authenticated
  with check (public.is_admin());
