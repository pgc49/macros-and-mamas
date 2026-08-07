-- Quiz / lead-magnet captures. Additive only — does not alter waitlist tables.

create table if not exists public.marketing_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  email text not null,
  first_name text,
  last_name text,

  source text,
  quiz_version int not null default 1,

  months_postpartum text,
  feeding_status text,
  height_in numeric,
  current_weight_lbs numeric,
  goal_weight_lbs numeric,
  goal text,
  activity_level text,
  flags text[],
  baby_birthday date,

  protein_low_g int,
  protein_high_g int,
  carbs_low_g int,
  carbs_high_g int,
  fat_low_g int,
  fat_high_g int,
  calories_low int,
  calories_high int,

  needs_review boolean not null default false,
  review_reason text,
  segment text not null default 'main',

  fbp text,
  fbc text,
  event_id text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  landing_path text
);

comment on table public.marketing_leads is
  'Marketing quiz / lead-magnet captures. Service-role writes only; no anon policies.';

create unique index if not exists marketing_leads_email_idx
  on public.marketing_leads (lower(email));
create index if not exists marketing_leads_created_at_idx
  on public.marketing_leads (created_at desc);
create index if not exists marketing_leads_segment_idx
  on public.marketing_leads (segment);
create index if not exists marketing_leads_review_idx
  on public.marketing_leads (needs_review)
  where needs_review = true;

alter table public.marketing_leads enable row level security;

-- Intentionally no policies for anon/authenticated — Blocks client inserts.
-- Pages Function uses SUPABASE_SERVICE_ROLE_KEY.
