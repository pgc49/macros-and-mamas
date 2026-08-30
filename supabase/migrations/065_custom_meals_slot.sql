-- ==================================================================
-- 065_custom_meals_slot.sql
-- Optional breakfast/lunch/dinner/snack stamp when she saves My meals.
-- Existing rows stay null until she saves again with a slot.
-- ==================================================================

alter table public.custom_meals
  add column if not exists slot text;

alter table public.custom_meals
  drop constraint if exists custom_meals_slot_valid;

alter table public.custom_meals
  add constraint custom_meals_slot_valid
  check (slot is null or slot in ('breakfast', 'lunch', 'dinner', 'snack'));

comment on column public.custom_meals.slot is
  'Optional meal slot set when she saves to My meals.';
