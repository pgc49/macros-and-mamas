-- Macros and Mamas — Supabase schema + RLS
-- Run this in the Supabase SQL editor after creating the project.
-- Never put service-role keys in the client or in git.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
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
  season_note text,
  role text not null default 'client',
  status text not null default 'pending',
  paid boolean not null default false,
  refunded boolean not null default false,
  stripe_customer_id text,
  stripe_payment_intent text,
  paid_at timestamptz,
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
  insert into public.profiles (id, email, terms_accepted_at, terms_version)
  values (
    new.id,
    nullif(lower(trim(new.email)), ''),
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

-- Inserts come from handle_new_user (SECURITY DEFINER). Clients must not
-- insert/delete profiles (blocks delete+reinsert admin escalation).
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_delete_own" on public.profiles;

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin"
  on public.profiles for update
  to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

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

-- waitlist (intake gates)
alter table public.waitlist enable row level security;

drop policy if exists "waitlist_insert_public" on public.waitlist;
create policy "waitlist_insert_public"
  on public.waitlist for insert
  to anon, authenticated
  with check (true);

drop policy if exists "waitlist_select_admin" on public.waitlist;
create policy "waitlist_select_admin"
  on public.waitlist for select
  to authenticated
  using (public.is_admin());

-- refunds log (eligibility declines after pay-first)
create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null,
  amount_cents int,
  stripe_refund_id text,
  stripe_payment_intent text,
  created_at timestamptz not null default now()
);

create index if not exists refunds_profile_created_idx
  on public.refunds (profile_id, created_at desc);

alter table public.refunds enable row level security;

drop policy if exists "refunds_select_admin" on public.refunds;
create policy "refunds_select_admin"
  on public.refunds for select
  to authenticated
  using (public.is_admin());

-- Clients must not flip payment / role / approval columns themselves.
create or replace function public.protect_payment_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  new.paid := old.paid;
  new.refunded := old.refunded;
  new.stripe_customer_id := old.stripe_customer_id;
  new.stripe_payment_intent := old.stripe_payment_intent;
  new.paid_at := old.paid_at;
  new.role := old.role;
  if new.status is distinct from old.status and new.status = 'active' then
    new.status := old.status;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_payment on public.profiles;
create trigger profiles_protect_payment
  before update on public.profiles
  for each row execute function public.protect_payment_columns();

create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  if TG_OP = 'INSERT' then
    new.role := 'client';
    new.paid := false;
    new.refunded := false;
    new.stripe_customer_id := null;
    new.stripe_payment_intent := null;
    new.paid_at := null;
    if new.status = 'active' then
      new.status := 'pending';
    end if;
    return new;
  end if;

  new.paid := old.paid;
  new.refunded := old.refunded;
  new.stripe_customer_id := old.stripe_customer_id;
  new.stripe_payment_intent := old.stripe_payment_intent;
  new.paid_at := old.paid_at;
  new.role := old.role;
  if new.status is distinct from old.status and new.status = 'active' then
    new.status := old.status;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_privileges_insert on public.profiles;
create trigger profiles_protect_privileges_insert
  before insert on public.profiles
  for each row execute function public.protect_profile_privileges();

create or replace function public.protect_macros_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  if TG_OP = 'INSERT' then
    new.approved := false;
  elsif TG_OP = 'UPDATE' then
    new.approved := old.approved;
  end if;
  return new;
end;
$$;

drop trigger if exists macros_protect_approval on public.macros;
create trigger macros_protect_approval
  before insert or update on public.macros
  for each row execute function public.protect_macros_approval();

-- Email send log (admin-only read; service role writes from Cloudflare)
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

create index if not exists email_events_profile_created_idx
  on public.email_events (profile_id, created_at desc);

alter table public.email_events enable row level security;

drop policy if exists "email_events_select_admin" on public.email_events;
create policy "email_events_select_admin"
  on public.email_events for select
  to authenticated
  using (public.is_admin());

drop policy if exists "email_events_insert_admin" on public.email_events;
create policy "email_events_insert_admin"
  on public.email_events for insert
  to authenticated
  with check (public.is_admin());


-- Client meal plans (draft + published; admin publish switch)
create table if not exists public.client_meal_plans (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  mode text not null default 'default'
    check (mode in ('default', 'personalized')),
  draft jsonb,
  draft_meta jsonb,
  published jsonb,
  published_at timestamptz,
  published_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.client_meal_plans enable row level security;

drop policy if exists "client_meal_plans_select_own_or_admin" on public.client_meal_plans;
create policy "client_meal_plans_select_own_or_admin"
  on public.client_meal_plans for select
  to authenticated
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists "client_meal_plans_insert_admin" on public.client_meal_plans;
create policy "client_meal_plans_insert_admin"
  on public.client_meal_plans for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "client_meal_plans_update_admin" on public.client_meal_plans;
create policy "client_meal_plans_update_admin"
  on public.client_meal_plans for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "client_meal_plans_delete_admin" on public.client_meal_plans;
create policy "client_meal_plans_delete_admin"
  on public.client_meal_plans for delete
  to authenticated
  using (public.is_admin());

-- Water log + bottle size
alter table public.profiles
  add column if not exists bottle_oz int not null default 24;

create table if not exists public.water_logs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  oz numeric not null check (oz > 0),
  created_at timestamptz not null default now()
);

create index if not exists water_logs_profile_date_idx
  on public.water_logs (profile_id, date, created_at desc);

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
