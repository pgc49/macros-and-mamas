-- ==================================================================
-- 012_water_log.sql
-- Water intake log + bottle size preference.
-- Goal = round(goal_weight / 2) oz. One row per tap; undo deletes latest.
-- ==================================================================

alter table public.profiles
  add column if not exists bottle_oz int not null default 24;

comment on column public.profiles.bottle_oz is
  'Preferred water bottle size in ounces for one-tap logging (default 24).';

create table if not exists public.water_logs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  oz numeric not null check (oz > 0),
  created_at timestamptz not null default now()
);

create index if not exists water_logs_profile_date_idx
  on public.water_logs (profile_id, date, created_at desc);

comment on table public.water_logs is
  'Per-tap water intake entries. Day total = sum(oz). Undo deletes the latest row for that date.';

alter table public.water_logs enable row level security;

drop policy if exists "water_logs_select_own_or_admin" on public.water_logs;
create policy "water_logs_select_own_or_admin"
  on public.water_logs for select
  to authenticated
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists "water_logs_insert_own" on public.water_logs;
create policy "water_logs_insert_own"
  on public.water_logs for insert
  to authenticated
  with check (profile_id = auth.uid());

drop policy if exists "water_logs_delete_own" on public.water_logs;
create policy "water_logs_delete_own"
  on public.water_logs for delete
  to authenticated
  using (profile_id = auth.uid());
