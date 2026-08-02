-- Additive attribution columns for Meta ads measurement (Pixel / CAPI / UTMs).
-- Does not alter existing columns, policies, or functions.

alter table public.cohort_waitlist
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content text,
  add column if not exists fbclid text,
  add column if not exists fbp text,
  add column if not exists fbc text,
  add column if not exists event_id text;

comment on column public.cohort_waitlist.utm_source is
  'utm_source from landing URL at signup.';
comment on column public.cohort_waitlist.utm_medium is
  'utm_medium from landing URL at signup.';
comment on column public.cohort_waitlist.utm_campaign is
  'utm_campaign from landing URL at signup.';
comment on column public.cohort_waitlist.utm_content is
  'utm_content from landing URL at signup.';
comment on column public.cohort_waitlist.fbclid is
  'Facebook click id from landing URL.';
comment on column public.cohort_waitlist.fbp is
  'Meta browser id cookie (_fbp).';
comment on column public.cohort_waitlist.fbc is
  'Meta click id cookie (_fbc) or constructed from fbclid.';
comment on column public.cohort_waitlist.event_id is
  'Shared event_id for Pixel + CAPI Lead deduplication.';

create index if not exists cohort_waitlist_event_id_idx
  on public.cohort_waitlist (event_id)
  where event_id is not null;
