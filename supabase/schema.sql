-- Macros and Mamas — Supabase schema + RLS
-- Run this in the Supabase SQL editor after creating the project.
-- Never put service-role keys in the client or in git.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  age int,
  phone text,
  current_weight numeric,
  goal_weight numeric,
  months_pp numeric,
  breastfeeding boolean,
  pregnant boolean,
  goal text,
  activity text,
  stress text,
  insulin_resistance boolean default false,
  diet text,
  pref_b text,
  pref_l text,
  pref_d text,
  role text not null default 'client',
  status text not null default 'pending',
  paid boolean not null default false,
  week int not null default 0,
  terms_accepted_at timestamptz,
  terms_version text,
  created_at timestamptz not null default now()
);

create table if not exists public.macros (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  cal int not null,
  protein int not null,
  fat int not null,
  carbs int not null,
  notes jsonb not null default '[]'::jsonb,
  approved boolean not null default false
);

create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  week_start date not null,
  item_id text not null,
  day text not null,
  unique (profile_id, week_start, item_id, day)
);

create table if not exists public.weighins (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  weight numeric not null
);

create table if not exists public.meal_logs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  name text not null,
  cal int,
  p int,
  c int,
  f int
);

create index if not exists checkins_profile_week_idx
  on public.checkins (profile_id, week_start);

create index if not exists weighins_profile_date_idx
  on public.weighins (profile_id, date);

create index if not exists meal_logs_profile_date_idx
  on public.meal_logs (profile_id, date);

-- ---------------------------------------------------------------------------
-- Auth signup → create empty profiles row
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  accepted text := new.raw_user_meta_data ->> 'terms_accepted_at';
  version text := new.raw_user_meta_data ->> 'terms_version';
begin
  insert into public.profiles (id, terms_accepted_at, terms_version)
  values (
    new.id,
    case when accepted is not null and accepted <> '' then accepted::timestamptz else null end,
    nullif(version, '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Admin helper (SECURITY DEFINER to avoid RLS recursion on profiles)
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Clients: select/insert/update/delete only their own rows (profile_id / id = auth.uid())
-- Admin (profiles.role = 'admin'): select and update all rows
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.macros enable row level security;
alter table public.checkins enable row level security;
alter table public.weighins enable row level security;
alter table public.meal_logs enable row level security;

-- profiles
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin"
  on public.profiles for update
  to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own"
  on public.profiles for delete
  to authenticated
  using (id = auth.uid());

-- macros
drop policy if exists "macros_select_own_or_admin" on public.macros;
create policy "macros_select_own_or_admin"
  on public.macros for select
  to authenticated
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists "macros_insert_own" on public.macros;
create policy "macros_insert_own"
  on public.macros for insert
  to authenticated
  with check (profile_id = auth.uid());

drop policy if exists "macros_update_own_or_admin" on public.macros;
create policy "macros_update_own_or_admin"
  on public.macros for update
  to authenticated
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());

drop policy if exists "macros_delete_own" on public.macros;
create policy "macros_delete_own"
  on public.macros for delete
  to authenticated
  using (profile_id = auth.uid());

-- checkins
drop policy if exists "checkins_select_own_or_admin" on public.checkins;
create policy "checkins_select_own_or_admin"
  on public.checkins for select
  to authenticated
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists "checkins_insert_own" on public.checkins;
create policy "checkins_insert_own"
  on public.checkins for insert
  to authenticated
  with check (profile_id = auth.uid());

drop policy if exists "checkins_update_own_or_admin" on public.checkins;
create policy "checkins_update_own_or_admin"
  on public.checkins for update
  to authenticated
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());

drop policy if exists "checkins_delete_own" on public.checkins;
create policy "checkins_delete_own"
  on public.checkins for delete
  to authenticated
  using (profile_id = auth.uid());

-- weighins
drop policy if exists "weighins_select_own_or_admin" on public.weighins;
create policy "weighins_select_own_or_admin"
  on public.weighins for select
  to authenticated
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists "weighins_insert_own" on public.weighins;
create policy "weighins_insert_own"
  on public.weighins for insert
  to authenticated
  with check (profile_id = auth.uid());

drop policy if exists "weighins_update_own_or_admin" on public.weighins;
create policy "weighins_update_own_or_admin"
  on public.weighins for update
  to authenticated
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());

drop policy if exists "weighins_delete_own" on public.weighins;
create policy "weighins_delete_own"
  on public.weighins for delete
  to authenticated
  using (profile_id = auth.uid());

-- meal_logs
drop policy if exists "meal_logs_select_own_or_admin" on public.meal_logs;
create policy "meal_logs_select_own_or_admin"
  on public.meal_logs for select
  to authenticated
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists "meal_logs_insert_own" on public.meal_logs;
create policy "meal_logs_insert_own"
  on public.meal_logs for insert
  to authenticated
  with check (profile_id = auth.uid());

drop policy if exists "meal_logs_update_own_or_admin" on public.meal_logs;
create policy "meal_logs_update_own_or_admin"
  on public.meal_logs for update
  to authenticated
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());

drop policy if exists "meal_logs_delete_own" on public.meal_logs;
create policy "meal_logs_delete_own"
  on public.meal_logs for delete
  to authenticated
  using (profile_id = auth.uid());
