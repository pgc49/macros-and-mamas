-- Stage 2: referral codes + attribution.
-- Writes: service role (Pages Functions). Reads: advocate own rows + admin.

alter table public.profiles
  add column if not exists ambassador boolean not null default false;

alter table public.profiles
  add column if not exists cohort_label text null;

comment on column public.profiles.ambassador is
  'True after 3 paid referrals (manual $100 payout). Set by referral webhook.';
comment on column public.profiles.cohort_label is
  'e.g. 2026-08 — set when useful for cohort ops; optional in stage 2.';

do $$ begin
  create type public.referral_status as enum (
    'pending_payment',
    'paid',
    'refunded'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.referral_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  code text not null,
  stripe_promotion_code_id text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint referral_codes_code_upper check (code = upper(code)),
  constraint referral_codes_code_format check (code ~ '^[A-Z0-9]+$')
);

create unique index if not exists referral_codes_code_uidx
  on public.referral_codes (code);

create unique index if not exists referral_codes_user_uidx
  on public.referral_codes (user_id);

create unique index if not exists referral_codes_stripe_promo_uidx
  on public.referral_codes (stripe_promotion_code_id);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  advocate_user_id uuid not null references public.profiles (id) on delete cascade,
  code text not null,
  referred_user_id uuid null references public.profiles (id) on delete set null,
  referred_email text null,
  stripe_checkout_session_id text not null,
  cohort_label text not null default '2026-08',
  status public.referral_status not null default 'pending_payment',
  credit_ledger_id uuid null references public.credit_ledger (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists referrals_session_uidx
  on public.referrals (stripe_checkout_session_id);

create index if not exists referrals_advocate_status_idx
  on public.referrals (advocate_user_id, status);

create index if not exists referrals_referred_user_idx
  on public.referrals (referred_user_id);

-- Stage 1 left related_referral_id without FK; wire it now that referrals exists.
do $$ begin
  alter table public.credit_ledger
    add constraint credit_ledger_related_referral_fk
    foreign key (related_referral_id) references public.referrals (id)
    on delete set null;
exception
  when duplicate_object then null;
end $$;

-- One referral credit grant per referral (idempotency for webhook retries).
create unique index if not exists credit_ledger_related_referral_uidx
  on public.credit_ledger (related_referral_id)
  where related_referral_id is not null
    and reason = 'referral'
    and amount_cents > 0
    and status <> 'reversed';

-- Optional quiz attribution (manual reconciliation only).
alter table public.marketing_leads
  add column if not exists referred_by text null;

comment on column public.marketing_leads.referred_by is
  'Optional quiz answer: who sent you / code or name. Manual recon only.';

alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;

alter table public.referral_codes force row level security;
alter table public.referrals force row level security;

revoke all on table public.referral_codes from anon, authenticated;
revoke all on table public.referrals from anon, authenticated;
grant select on table public.referral_codes to authenticated;
grant select on table public.referrals to authenticated;

drop policy if exists "referral_codes_select_own_or_admin" on public.referral_codes;
create policy "referral_codes_select_own_or_admin"
  on public.referral_codes
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "referrals_select_own_or_admin" on public.referrals;
create policy "referrals_select_own_or_admin"
  on public.referrals
  for select
  to authenticated
  using (advocate_user_id = auth.uid() or public.is_admin());
