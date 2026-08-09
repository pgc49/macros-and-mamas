-- Stage 1: mama credit ledger (referrals / milestones / manual / redemptions).
-- Writes: service role only (Pages Functions webhook/cron/admin API).
-- Reads: owner (user_id = auth.uid()) + admin (is_admin()).
-- related_referral_id is a bare uuid until stage 2 creates referrals (no FK).

do $$ begin
  create type public.credit_ledger_status as enum (
    'pending',
    'available',
    'redeemed',
    'reversed'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.credit_ledger_reason as enum (
    'referral',
    'milestone',
    'manual',
    'redemption',
    'reversal'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount_cents integer not null,
  status public.credit_ledger_status not null default 'pending',
  reason public.credit_ledger_reason not null,
  related_referral_id uuid null,
  vests_at timestamptz null,
  mirrored_at timestamptz null,
  stripe_balance_transaction_id text null,
  note text null,
  created_at timestamptz not null default now(),
  constraint credit_ledger_amount_nonzero check (amount_cents <> 0)
);

create index if not exists credit_ledger_user_id_idx
  on public.credit_ledger (user_id);

create index if not exists credit_ledger_status_vests_at_idx
  on public.credit_ledger (status, vests_at)
  where status = 'pending';

create index if not exists credit_ledger_available_unmirrored_idx
  on public.credit_ledger (status, mirrored_at)
  where status = 'available' and mirrored_at is null;

comment on table public.credit_ledger is
  'Append-ish credit ledger. Available balance = SUM(amount_cents) WHERE status=available. Stripe Customer Balance mirrored only when available.';

comment on column public.credit_ledger.mirrored_at is
  'When this available credit (or its reversal debit) was posted to Stripe Customer Balance.';

alter table public.credit_ledger enable row level security;

drop policy if exists "credit_ledger_select_own_or_admin" on public.credit_ledger;
create policy "credit_ledger_select_own_or_admin"
  on public.credit_ledger
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- No insert/update/delete policies for authenticated — service role only.
