-- ==================================================================
-- 011_client_meal_plans.sql
-- Per-client meal plan draft + published snapshot.
-- mode = 'default'  → client sees shared recipe bank (code)
-- mode = 'personalized' → client sees published jsonb week
-- Admin flips mode via Publish / Revert. Safe one-by-one rollout.
-- ==================================================================

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

comment on table public.client_meal_plans is
  'Admin meal-plan drafts and published personalized weeks. mode gates what the client Meals tab shows.';

comment on column public.client_meal_plans.mode is
  'default = shared recipe bank; personalized = use published jsonb';

comment on column public.client_meal_plans.draft is
  'Callie working copy (AI generate / feedback regenerate). Not shown to client.';

comment on column public.client_meal_plans.published is
  'Frozen copy of the week the client sees when mode=personalized.';

create index if not exists client_meal_plans_mode_idx
  on public.client_meal_plans (mode);

alter table public.client_meal_plans enable row level security;

-- Clients: read own row only (app uses mode + published; draft is their food plan, low sensitivity)
drop policy if exists "client_meal_plans_select_own_or_admin" on public.client_meal_plans;
create policy "client_meal_plans_select_own_or_admin"
  on public.client_meal_plans for select
  to authenticated
  using (profile_id = auth.uid() or public.is_admin());

-- Clients must NOT insert/update/delete — only admin (or service role)
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
