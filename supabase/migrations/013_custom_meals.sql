-- ==================================================================
-- 013_custom_meals.sql
-- Saved “My meals” — name + macros for one-tap re-logging (MFP-style).
-- ==================================================================

create table if not exists public.custom_meals (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  cal numeric not null default 0,
  p numeric not null default 0,
  c numeric not null default 0,
  f numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, name)
);

create index if not exists custom_meals_profile_idx
  on public.custom_meals (profile_id, updated_at desc);

comment on table public.custom_meals is
  'Client-saved custom meals (name + serving macros) for one-tap logging.';

alter table public.custom_meals enable row level security;

drop policy if exists "custom_meals_select_own" on public.custom_meals;
create policy "custom_meals_select_own"
  on public.custom_meals for select
  to authenticated
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists "custom_meals_insert_own" on public.custom_meals;
create policy "custom_meals_insert_own"
  on public.custom_meals for insert
  to authenticated
  with check (profile_id = auth.uid());

drop policy if exists "custom_meals_update_own" on public.custom_meals;
create policy "custom_meals_update_own"
  on public.custom_meals for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists "custom_meals_delete_own" on public.custom_meals;
create policy "custom_meals_delete_own"
  on public.custom_meals for delete
  to authenticated
  using (profile_id = auth.uid());
