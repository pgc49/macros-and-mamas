-- ==================================================================
-- 014_client_week_plans.sql
-- Client-owned weekly meal planner. She picks meals for the week;
-- grocery list is built only from this committed plan.
-- Admin published plans (client_meal_plans) can seed suggestions.
-- ==================================================================

create table if not exists public.client_week_plans (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  days jsonb not null default '[]'::jsonb,
  source text not null default 'manual'
    check (source in ('manual', 'ai', 'coach_seed')),
  updated_at timestamptz not null default now()
);

comment on table public.client_week_plans is
  'Client-owned Mon–Sun meal plan. Grocery list derives from days[].meals only.';

comment on column public.client_week_plans.days is
  'Array of { day, theme?, meals[] }. Meals may be partial — empty slots are not shopped.';

comment on column public.client_week_plans.source is
  'manual = she picked; ai = accepted AI suggest week; coach_seed = started from Callie publish.';

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
