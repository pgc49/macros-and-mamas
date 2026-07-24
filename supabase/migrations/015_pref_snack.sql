-- ==================================================================
-- 015_pref_snack.sql
-- Snack foods she loves (planner Foods I love + AI suggest).
-- ==================================================================

alter table public.profiles
  add column if not exists pref_s text;

comment on column public.profiles.pref_s is
  'Snack foods she loves — free text from intake / planner Foods I love editor.';
