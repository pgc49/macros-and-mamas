-- Stage 4 slice A: alumni membership subscription fields on profiles.
-- Stripe subscription id + status drive Payments UI and the post–free-month login gate.
-- Client writes locked (service_role / admin only).

alter table public.profiles
  add column if not exists stripe_subscription_id text null;

alter table public.profiles
  add column if not exists subscription_status text null;

alter table public.profiles
  add column if not exists subscription_current_period_end timestamptz null;

alter table public.profiles
  add column if not exists subscription_trial_end timestamptz null;

comment on column public.profiles.stripe_subscription_id is
  'Stripe Subscription id for alumni membership (sub_…). Null until opt-in.';
comment on column public.profiles.subscription_status is
  'Stripe subscription.status mirror: trialing | active | past_due | canceled | unpaid | …';
comment on column public.profiles.subscription_current_period_end is
  'End of the current Stripe billing period (renewal / access boundary).';
comment on column public.profiles.subscription_trial_end is
  'Stripe trial end when status=trialing; founding free month usually pins here.';

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
  return new;
end;
$$;
