-- Pay-first enrollment: Stripe IDs, refunded flag, refund log, protect payment columns
-- Run this entire file in the Supabase SQL editor after deploy.

alter table public.profiles
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_payment_intent text,
  add column if not exists paid_at timestamptz,
  add column if not exists refunded boolean not null default false;

comment on column public.profiles.stripe_customer_id is
  'Stripe customer id from Checkout Session (webhook)';
comment on column public.profiles.stripe_payment_intent is
  'Stripe PaymentIntent id used for eligibility refunds';
comment on column public.profiles.paid_at is
  'When checkout.session.completed flipped paid=true';
comment on column public.profiles.refunded is
  'True after a full eligibility refund; blocks app access';

create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null,
  amount_cents int,
  stripe_refund_id text,
  stripe_payment_intent text,
  created_at timestamptz not null default now()
);

create index if not exists refunds_profile_created_idx
  on public.refunds (profile_id, created_at desc);

alter table public.refunds enable row level security;

drop policy if exists "refunds_select_admin" on public.refunds;
create policy "refunds_select_admin"
  on public.refunds for select
  to authenticated
  using (public.is_admin());

-- Clients must not flip payment / role / approval columns themselves.
-- Service role (webhook, refund API) and admins may.
create or replace function public.protect_payment_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  new.paid := old.paid;
  new.refunded := old.refunded;
  new.stripe_customer_id := old.stripe_customer_id;
  new.stripe_payment_intent := old.stripe_payment_intent;
  new.paid_at := old.paid_at;
  new.role := old.role;
  -- Clients may keep status at pending (intake) but cannot self-activate
  if new.status is distinct from old.status and new.status = 'active' then
    new.status := old.status;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_payment on public.profiles;
create trigger profiles_protect_payment
  before update on public.profiles
  for each row execute function public.protect_payment_columns();
