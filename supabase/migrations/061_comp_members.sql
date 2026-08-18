-- Complimentary members: paid=true for dashboard access, distinct from Stripe-paid.
-- Clients cannot flip `comp` (same class of lock as paid / stripe_*).
--
-- After deploy, mark complimentary members in the SQL editor (postgres / service_role).
-- Do not put emails in this repo. Example:
--   update public.profiles set comp = true where id = '<uuid>' and paid = true;
-- Admin portal: client detail → Mark complimentary / Clear complimentary.

alter table public.profiles
  add column if not exists comp boolean not null default false;

comment on column public.profiles.comp is
  'Complimentary seat: paid=true for access, but not a Stripe customer. Admin/service_role only.';

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
  new.comp := old.comp;
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
    new.comp := false;
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
  new.comp := old.comp;
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
