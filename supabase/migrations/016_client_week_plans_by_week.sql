-- ==================================================================
-- 016_client_week_plans_by_week.sql
-- One plan per calendar week (Mon start), like meal logs / checkins.
-- Future weeks stay blank until she adds meals (no copy-from-last yet).
-- Safe to re-run after 014.
-- ==================================================================

-- Ensure table exists (014 may not have been applied yet)
create table if not exists public.client_week_plans (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  week_start date not null default (date_trunc('week', now())::date),
  days jsonb not null default '[]'::jsonb,
  source text not null default 'manual'
    check (source in ('manual', 'ai', 'coach_seed')),
  updated_at timestamptz not null default now()
);

-- Migrate 014 shape (profile_id PK, no week_start) → week-scoped
alter table public.client_week_plans
  add column if not exists week_start date;

update public.client_week_plans
set week_start = (date_trunc('week', coalesce(updated_at, now()))::date)
where week_start is null;

update public.client_week_plans
set week_start = (date_trunc('week', now())::date)
where week_start is null;

alter table public.client_week_plans
  alter column week_start set not null;

-- Drop legacy single-column PK (profile_id only)
do $$
declare
  pk_cols text;
begin
  select string_agg(a.attname, ',' order by x.ord)
  into pk_cols
  from pg_constraint c
  cross join lateral unnest(c.conkey) with ordinality as x(attnum, ord)
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = x.attnum
  where c.conrelid = 'public.client_week_plans'::regclass
    and c.contype = 'p';

  if pk_cols = 'profile_id' then
    alter table public.client_week_plans drop constraint client_week_plans_pkey;
  end if;
end $$;

-- Composite PK (skip if already present)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.client_week_plans'::regclass
      and contype = 'p'
  ) then
    alter table public.client_week_plans
      add primary key (profile_id, week_start);
  end if;
end $$;

create unique index if not exists client_week_plans_profile_week_uidx
  on public.client_week_plans (profile_id, week_start);

create index if not exists client_week_plans_profile_week_idx
  on public.client_week_plans (profile_id, week_start desc);

comment on table public.client_week_plans is
  'Client meal plan per Mon–Sun week. Grocery derives from that week''s days[].meals.';

comment on column public.client_week_plans.week_start is
  'Monday (ISO) of the planned week, YYYY-MM-DD.';

comment on column public.client_week_plans.source is
  'manual = she picked; ai = accepted AI suggest week; coach_seed = legacy seed.';

alter table public.client_week_plans enable row level security;

drop policy if exists "client_week_plans_select_own_or_admin" on public.client_week_plans;
create policy "client_week_plans_select_own_or_admin"
  on public.client_week_plans for select
  to authenticated
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists "client_week_plans_insert_own" on public.client_week_plans;
create policy "client_week_plans_insert_own"
  on public.client_week_plans for insert
  to authenticated
  with check (profile_id = auth.uid());

drop policy if exists "client_week_plans_update_own" on public.client_week_plans;
create policy "client_week_plans_update_own"
  on public.client_week_plans for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists "client_week_plans_delete_own" on public.client_week_plans;
create policy "client_week_plans_delete_own"
  on public.client_week_plans for delete
  to authenticated
  using (profile_id = auth.uid());
