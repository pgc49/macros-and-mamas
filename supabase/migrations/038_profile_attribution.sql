-- First-touch marketing attribution on profiles (UTMs + anonymous browser id).
-- Written by the client at signup / join; webhook may backfill from Stripe metadata.
-- Does not alter payment/privilege triggers — these columns are client-writable.

alter table public.profiles
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content text,
  add column if not exists utm_term text,
  add column if not exists fbclid text,
  add column if not exists landing_path text,
  add column if not exists referrer_host text,
  add column if not exists anon_id text,
  add column if not exists attributed_at timestamptz;

comment on column public.profiles.utm_source is
  'First-touch utm_source captured in the browser before/at signup.';
comment on column public.profiles.utm_medium is
  'First-touch utm_medium captured in the browser before/at signup.';
comment on column public.profiles.utm_campaign is
  'First-touch utm_campaign captured in the browser before/at signup.';
comment on column public.profiles.utm_content is
  'First-touch utm_content captured in the browser before/at signup.';
comment on column public.profiles.utm_term is
  'First-touch utm_term captured in the browser before/at signup.';
comment on column public.profiles.fbclid is
  'First-touch Meta fbclid if present at capture.';
comment on column public.profiles.landing_path is
  'First path seen with attribution (e.g. / or /join).';
comment on column public.profiles.referrer_host is
  'document.referrer hostname at first attribution capture (no path/query).';
comment on column public.profiles.anon_id is
  'First-party browser id (localStorage) stitched onto the profile at signup. Not from Cloudflare Web Analytics.';
comment on column public.profiles.attributed_at is
  'When first-touch attribution was written to this profile.';

create index if not exists profiles_utm_campaign_idx
  on public.profiles (utm_campaign)
  where utm_campaign is not null;

create index if not exists profiles_anon_id_idx
  on public.profiles (anon_id)
  where anon_id is not null;
