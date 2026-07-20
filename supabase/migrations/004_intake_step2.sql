-- Intake Step 2 redesign: waitlist for gated moms + season note for Callie
-- Run this entire file in the Supabase SQL editor.

-- Free-text context for Callie (tastes step)
alter table public.profiles
  add column if not exists season_note text;

comment on column public.profiles.season_note is
  'Optional free-text from intake: anything about her season of life Callie should know';

-- Waitlist for pregnant / early-nursing gates (inline email capture)
create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  reason text not null check (reason in ('pregnant', 'early_nursing')),
  months_pp numeric,
  eligible_on date,
  profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists waitlist_reason_created_idx
  on public.waitlist (reason, created_at desc);

create index if not exists waitlist_eligible_on_idx
  on public.waitlist (eligible_on)
  where eligible_on is not null;

alter table public.waitlist enable row level security;

-- Anyone signed in (or anon) can join the waitlist from the intake gates
drop policy if exists "waitlist_insert_public" on public.waitlist;
create policy "waitlist_insert_public"
  on public.waitlist for insert
  to anon, authenticated
  with check (true);

-- Only admins can read the waitlist
drop policy if exists "waitlist_select_admin" on public.waitlist;
create policy "waitlist_select_admin"
  on public.waitlist for select
  to authenticated
  using (public.is_admin());
