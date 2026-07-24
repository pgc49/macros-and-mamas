-- Soft category for meal logs: breakfast | lunch | dinner | snack
-- Optional — auto-filled from Plan/recipes or guessed by time of day.
-- Run in Supabase SQL editor if not applied via migration tooling.

alter table public.meal_logs
  add column if not exists slot text;

comment on column public.meal_logs.slot is
  'Soft meal category: breakfast | lunch | dinner | snack. Nullable for legacy rows.';

-- Soft check (allow null); keep loose so we can add values later if needed.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'meal_logs_slot_check'
  ) then
    alter table public.meal_logs
      add constraint meal_logs_slot_check
      check (slot is null or slot in ('breakfast', 'lunch', 'dinner', 'snack'));
  end if;
end $$;

create index if not exists meal_logs_profile_date_slot_idx
  on public.meal_logs (profile_id, date, slot);
