-- Meal logging upgrades: source column + estimate_calls cost watch
-- Run in Supabase SQL editor if not applied via migration tooling.

alter table public.meal_logs
  add column if not exists source text;

comment on column public.meal_logs.source is
  'recipe | photo | text | manual';

create table if not exists public.estimate_calls (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  created_at timestamptz not null default now()
);

create index if not exists estimate_calls_profile_created_idx
  on public.estimate_calls (profile_id, created_at desc);

alter table public.estimate_calls enable row level security;

drop policy if exists "estimate_calls_select_own_or_admin" on public.estimate_calls;
create policy "estimate_calls_select_own_or_admin"
  on public.estimate_calls for select
  to authenticated
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists "estimate_calls_insert_own" on public.estimate_calls;
create policy "estimate_calls_insert_own"
  on public.estimate_calls for insert
  to authenticated
  with check (profile_id = auth.uid());
