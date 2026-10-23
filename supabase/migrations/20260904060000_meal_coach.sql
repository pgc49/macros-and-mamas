-- ==================================================================
-- 20260904060000_meal_coach.sql
-- The meal coach: attribution on logs, recipe steps on My meals, and
-- the coach transcript.
-- ==================================================================

-- meal_logs.origin
--
-- `via` already answers "how did we arrive at these numbers" (recipe = exact,
-- describe/photo/menu = estimate) and the log row shows it to her, so the
-- coach must not overwrite it: a coach card taken from Callie's bank is still
-- exact. `origin` answers the separate question of where the log came from,
-- which is what tells us whether the coach is doing anything.
alter table public.meal_logs
  add column if not exists origin text;

alter table public.meal_logs
  drop constraint if exists meal_logs_origin_valid;

alter table public.meal_logs
  add constraint meal_logs_origin_valid
  check (origin is null or origin in ('coach'));

comment on column public.meal_logs.origin is
  'Where the log came from, independent of how its macros were derived. '
  'null = logged the usual way. coach = she took a coach card.';

create index if not exists meal_logs_origin_idx
  on public.meal_logs (origin, date desc)
  where origin is not null;

-- custom_meals.steps
--
-- The coach can build a meal around what she actually has. Without a place to
-- put the method, "Save to My meals" keeps the macros and throws the recipe
-- away, and she can never make it again.
alter table public.custom_meals
  add column if not exists steps text;

comment on column public.custom_meals.steps is
  'Optional method, one step per line. Set when she saves a coach-built meal.';

-- coach_messages
--
-- Append-only transcript so the thread survives a reload and Callie can see
-- what the coach told her mamas. `payload` holds the rendered cards; it is
-- display state, never a source of macros.
create table if not exists public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('mama', 'coach')),
  body text not null default '',
  kind text not null default 'text'
    check (kind in ('text', 'cards', 'deflect', 'photo', 'read')),
  payload jsonb,
  -- Her day, decided on her device. The server never guesses a time zone.
  local_date date,
  created_at timestamptz not null default now()
);

create index if not exists coach_messages_profile_created_idx
  on public.coach_messages (profile_id, created_at desc);

alter table public.coach_messages enable row level security;

drop policy if exists "coach_messages_select_own_or_admin" on public.coach_messages;
create policy "coach_messages_select_own_or_admin"
  on public.coach_messages for select
  to authenticated
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists "coach_messages_insert_own" on public.coach_messages;
create policy "coach_messages_insert_own"
  on public.coach_messages for insert
  to authenticated
  with check (profile_id = auth.uid());

-- She can clear her own thread. Nobody edits one after the fact.
drop policy if exists "coach_messages_delete_own" on public.coach_messages;
create policy "coach_messages_delete_own"
  on public.coach_messages for delete
  to authenticated
  using (profile_id = auth.uid());
