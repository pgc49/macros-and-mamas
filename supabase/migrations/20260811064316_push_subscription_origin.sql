alter table public.push_subscriptions
  add column if not exists app_origin text,
  add column if not exists last_seen_at timestamptz not null default now();

alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_app_origin_check;
alter table public.push_subscriptions
  add constraint push_subscriptions_app_origin_check
  check (
    app_origin is null
    or app_origin ~ '^https://[a-zA-Z0-9.-]+(?::[0-9]+)?$'
    or app_origin ~ '^http://(localhost|127\\.0\\.0\\.1)(?::[0-9]+)?$'
  );

create index if not exists push_subscriptions_profile_origin_idx
  on public.push_subscriptions (profile_id, app_origin);

comment on column public.push_subscriptions.app_origin is
  'Origin that registered this endpoint; used to retire old admin-origin subscriptions.';
