-- Stage 0: Stripe webhook idempotency.
-- Webhook inserts event_id before handling; on conflict, return 200 and skip.
-- Service role writes from /api/stripe-webhook; clients have no access.
-- Admin can read all rows (profiles.role = 'admin' via public.is_admin()).

create table if not exists public.stripe_events (
  event_id text primary key,
  type text not null,
  processed_at timestamptz not null default now()
);

create index if not exists stripe_events_type_idx
  on public.stripe_events (type);

create index if not exists stripe_events_processed_at_idx
  on public.stripe_events (processed_at desc);

alter table public.stripe_events enable row level security;

drop policy if exists "stripe_events_admin_select" on public.stripe_events;
create policy "stripe_events_admin_select"
  on public.stripe_events
  for select
  to authenticated
  using (public.is_admin());

comment on table public.stripe_events is
  'Stripe webhook idempotency keys. Insert-before-handle; conflict = already processed.';
