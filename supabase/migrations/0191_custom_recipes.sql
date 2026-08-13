-- ==================================================================
-- 019_custom_recipes.sql
-- Let a saved “My meal” carry the recipe it came from.
--
-- cal/p/c/f stay ONE SERVING — same convention as RECIPES[] in
-- src/content/data.js, where macros are the logged plate and `serves`
-- only describes how big the batch was. Nothing about existing rows
-- changes; they are simply serves = 1 with no ingredient list.
-- ==================================================================

alter table public.custom_meals
  add column if not exists serves numeric not null default 1;

alter table public.custom_meals
  add column if not exists ingredients text;

comment on column public.custom_meals.serves is
  'Portions the batch yields. cal/p/c/f are per serving, never the batch total.';

comment on column public.custom_meals.ingredients is
  'Optional batch ingredient list shown on the saved recipe card.';

-- A yield of zero would make per-serving macros undefined.
alter table public.custom_meals
  drop constraint if exists custom_meals_serves_positive;

alter table public.custom_meals
  add constraint custom_meals_serves_positive
  check (serves > 0 and serves <= 24);
