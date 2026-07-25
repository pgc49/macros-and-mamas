-- Cohort waitlist (founding closed → cohort two priority access).
-- Separate from public.waitlist (pregnant / early-nursing eligibility holds).
-- Run this entire file in the Supabase SQL editor.

create table if not exists public.cohort_waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  first_name text not null,
  last_name text not null,
  phone text not null,
  cohort text not null default 'cohort_2',
  source text not null default 'homepage',
  -- Conversion tracking (filled later when she signs up / pays)
  profile_id uuid references public.profiles (id) on delete set null,
  converted_at timestamptz,
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

comment on table public.cohort_waitlist is
  'Priority waitlist for the next cohort (homepage capture). Track conversion via profile_id / paid_at.';
comment on column public.cohort_waitlist.first_name is
  'Given / first name from the waitlist form.';
comment on column public.cohort_waitlist.last_name is
  'Family / last name from the waitlist form.';
comment on column public.cohort_waitlist.cohort is
  'Which cohort she joined the waitlist for (e.g. cohort_2).';
comment on column public.cohort_waitlist.profile_id is
  'Set when a matching auth user / profile is created from this waitlist email.';
comment on column public.cohort_waitlist.converted_at is
  'When she created an account (signup from waitlist).';
comment on column public.cohort_waitlist.paid_at is
  'When she paid for the program after waitlist.';

-- One row per email per cohort (case-insensitive)
create unique index if not exists cohort_waitlist_email_cohort_uidx
  on public.cohort_waitlist (lower(email), cohort);

create index if not exists cohort_waitlist_cohort_created_idx
  on public.cohort_waitlist (cohort, created_at desc);

create index if not exists cohort_waitlist_profile_idx
  on public.cohort_waitlist (profile_id)
  where profile_id is not null;

alter table public.cohort_waitlist enable row level security;

-- Public can join from the homepage (anon or signed-in)
drop policy if exists "cohort_waitlist_insert_public" on public.cohort_waitlist;
create policy "cohort_waitlist_insert_public"
  on public.cohort_waitlist for insert
  to anon, authenticated
  with check (true);

-- Only admins can read (and later update conversion fields via service role / SQL)
drop policy if exists "cohort_waitlist_select_admin" on public.cohort_waitlist;
create policy "cohort_waitlist_select_admin"
  on public.cohort_waitlist for select
  to authenticated
  using (public.is_admin());
