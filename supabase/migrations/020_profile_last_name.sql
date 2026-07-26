-- Split client names: profiles.name stays first name; add last_name.
-- Run this entire file in the Supabase SQL editor.

alter table public.profiles
  add column if not exists last_name text;

comment on column public.profiles.name is
  'First / given name from intake.';
comment on column public.profiles.last_name is
  'Last / family name from intake.';
