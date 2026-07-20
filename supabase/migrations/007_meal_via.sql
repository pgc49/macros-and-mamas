-- Meal log provenance: via column for photo | describe | recipe | manual | adjusted
-- Run in Supabase SQL editor if not applied via migration tooling.

alter table public.meal_logs
  add column if not exists via text;

comment on column public.meal_logs.via is
  'photo | describe | recipe | manual | adjusted';

-- Backfill from legacy source column; anything unknown → manual.
update public.meal_logs
set via = case
  when source = 'photo' then 'photo'
  when source = 'text' then 'describe'
  when source = 'describe' then 'describe'
  when source = 'recipe' then 'recipe'
  when source = 'manual' then 'manual'
  when source = 'adjusted' then 'adjusted'
  else 'manual'
end
where via is null;

alter table public.meal_logs
  alter column via set default 'manual';
