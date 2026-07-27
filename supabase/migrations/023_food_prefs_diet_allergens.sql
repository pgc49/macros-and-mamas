-- ==================================================================
-- 023_food_prefs_diet_allergens.sql
-- Diet stays on profiles.diet; add allergens (hard) + soft food avoids.
-- Mama Food prefs can edit these so Suggest my week honors them.
-- ==================================================================

alter table public.profiles
  add column if not exists allergens text[] not null default '{}',
  add column if not exists allergen_note text,
  add column if not exists food_avoids text;

comment on column public.profiles.allergens is
  'Hard allergens / never-eat tags (e.g. dairy, peanuts, shellfish). AI must not include these.';
comment on column public.profiles.allergen_note is
  'Optional free-text allergen detail beyond the chip tags.';
comment on column public.profiles.food_avoids is
  'Soft dislikes (e.g. mushrooms, cilantro) — strongly prefer not, not always a hard ban.';
