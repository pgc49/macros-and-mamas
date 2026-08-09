-- Stage 4: cancel save-offer log + cancel_at_period_end mirror on profiles.

create table if not exists public.cancel_saves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  resolved boolean not null default false,
  resolved_at timestamptz null,
  note text null
);

create index if not exists cancel_saves_user_id_idx on public.cancel_saves (user_id);
create index if not exists cancel_saves_unresolved_idx
  on public.cancel_saves (created_at desc)
  where resolved = false;

comment on table public.cancel_saves is
  'Mama chose $19 app-only save offer on cancel. Fulfillment is MANUAL in Stripe (tier=alumni_19).';

alter table public.cancel_saves enable row level security;

drop policy if exists cancel_saves_select_own_or_admin on public.cancel_saves;
create policy cancel_saves_select_own_or_admin
  on public.cancel_saves for select
  using (auth.uid() = user_id or public.is_admin());

-- Inserts/updates only via service_role (API).
revoke insert, update, delete on public.cancel_saves from anon, authenticated;
grant select on public.cancel_saves to authenticated;
grant all on public.cancel_saves to service_role;

alter table public.profiles
  add column if not exists subscription_cancel_at_period_end boolean not null default false;

comment on column public.profiles.subscription_cancel_at_period_end is
  'Mirror of Stripe subscription.cancel_at_period_end for alumni membership.';

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
  new.lab_review_purchased := old.lab_review_purchased;
  new.lab_review_purchased_at := old.lab_review_purchased_at;
  new.role := old.role;
  new.status := old.status;
  new.week := old.week;
  new.created_at := old.created_at;
  new.ambassador := old.ambassador;
  new.cohort_label := old.cohort_label;
  new.tier := old.tier;
  new.stripe_subscription_id := old.stripe_subscription_id;
  new.subscription_status := old.subscription_status;
  new.subscription_current_period_end := old.subscription_current_period_end;
  new.subscription_trial_end := old.subscription_trial_end;
  new.subscription_cancel_at_period_end := old.subscription_cancel_at_period_end;
  return new;
end;
$$;

create or replace function public.protect_profile_privileges()
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

  if TG_OP = 'INSERT' then
    new.role := 'client';
    new.paid := false;
    new.refunded := false;
    new.stripe_customer_id := null;
    new.stripe_payment_intent := null;
    new.paid_at := null;
    new.lab_review_purchased := false;
    new.lab_review_purchased_at := null;
    new.ambassador := false;
    new.cohort_label := null;
    new.tier := 'none';
    new.stripe_subscription_id := null;
    new.subscription_status := null;
    new.subscription_current_period_end := null;
    new.subscription_trial_end := null;
    new.subscription_cancel_at_period_end := false;
    new.created_at := now();
    if new.status = 'active' then
      new.status := 'pending';
    end if;
    return new;
  end if;

  new.paid := old.paid;
  new.refunded := old.refunded;
  new.stripe_customer_id := old.stripe_customer_id;
  new.stripe_payment_intent := old.stripe_payment_intent;
  new.paid_at := old.paid_at;
  new.lab_review_purchased := old.lab_review_purchased;
  new.lab_review_purchased_at := old.lab_review_purchased_at;
  new.role := old.role;
  new.status := old.status;
  new.week := old.week;
  new.created_at := old.created_at;
  new.ambassador := old.ambassador;
  new.cohort_label := old.cohort_label;
  new.tier := old.tier;
  new.stripe_subscription_id := old.stripe_subscription_id;
  new.subscription_status := old.subscription_status;
  new.subscription_current_period_end := old.subscription_current_period_end;
  new.subscription_trial_end := old.subscription_trial_end;
  new.subscription_cancel_at_period_end := old.subscription_cancel_at_period_end;
  return new;
end;
$$;
