-- ==================================================================
-- 035_homescreen_tip_dismissed.sql
-- Persist Getting Started tip dismiss on the profile (survives
-- preview URLs / cleared localStorage / device switches).
-- ==================================================================

alter table public.profiles
  add column if not exists homescreen_tip_dismissed_at timestamptz;

comment on column public.profiles.homescreen_tip_dismissed_at is
  'When mama dismissed the home-screen Getting Started tip. Null = may still show (unless already standalone).';

-- Current cohort already installed — stop re-showing. New joiners stay null and see the tip once.
update public.profiles
set homescreen_tip_dismissed_at = coalesce(homescreen_tip_dismissed_at, now())
where status = 'active'
  and homescreen_tip_dismissed_at is null;

-- Admins dogfood the dashboard on preview URLs often — don't keep nagging them.
update public.profiles
set homescreen_tip_dismissed_at = coalesce(homescreen_tip_dismissed_at, now())
where coalesce(role, '') = 'admin'
  and homescreen_tip_dismissed_at is null;
