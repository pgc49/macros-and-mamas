-- Quiz / marketing email opt-outs. Service-role writes; admin read.
-- Also index email_events by address so the quiz drip can be idempotent
-- without a profiles row.

create table if not exists public.email_unsubscribes (
  email text primary key,
  created_at timestamptz not null default now(),
  source text
);

comment on table public.email_unsubscribes is
  'Quiz / marketing email opt-outs. Service-role writes; no anon policies.';

alter table public.email_unsubscribes enable row level security;

drop policy if exists email_unsubscribes_select_admin on public.email_unsubscribes;
create policy email_unsubscribes_select_admin
  on public.email_unsubscribes for select
  to authenticated
  using (public.is_admin());

create index if not exists email_events_to_email_type_idx
  on public.email_events (lower(to_email), email_type);
