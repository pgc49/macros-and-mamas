-- Cohort 3 / November Group (2026-11).
-- Week 1 stays Monday, November 2. New accounts from this migration stamp
-- 2026-11. Paid Cohort 2 rows are not moved.
--
-- profiles_protect_privileges nulls cohort_label on non-privileged inserts,
-- which wiped the handle_new_user stamp in 067. Force the open cohort on
-- those inserts so a mama cannot pick a label, and new signups still land
-- in Cohort 3.

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
    new.cohort_label := '2026-11';
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

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  accepted text := new.raw_user_meta_data ->> 'terms_accepted_at';
  version text := new.raw_user_meta_data ->> 'terms_version';
begin
  insert into public.profiles (id, email, terms_accepted_at, terms_version, cohort_label)
  values (
    new.id,
    nullif(lower(trim(new.email)), ''),
    case when accepted is not null and accepted <> '' then accepted::timestamptz else null end,
    nullif(version, ''),
    '2026-11'
  );
  return new;
end;
$$;

insert into public.conversations (type, cohort_label, label, read_only, guidelines)
select 'cohort', '2026-11', 'November Group', false,
  E'Group guidelines\n• Kindness first — we''re all figuring this out.\n• No medical advice — share experience, not prescriptions.\n• No promo or selling.'
where not exists (
  select 1 from public.conversations where type = 'cohort' and cohort_label = '2026-11'
);

insert into public.conversation_members (conversation_id, user_id, notify_level)
select c.id, a.id, 'highlights'
from public.conversations c
cross join public.profiles a
where c.type = 'cohort'
  and c.cohort_label = '2026-11'
  and a.role = 'admin'
on conflict (conversation_id, user_id) do nothing;

insert into public.conversation_messages (conversation_id, sender_id, body, kind)
select c.id, null, c.guidelines, 'system'
from public.conversations c
where c.cohort_label = '2026-11'
  and not exists (
    select 1 from public.conversation_messages m
    where m.conversation_id = c.id and m.kind = 'system'
  );

insert into public.channel_prompts (conversation_id, body, cadence, active)
select c.id, 'Wins from this week — go.', 'weekly', true
from public.conversations c
where c.cohort_label = '2026-11'
  and not exists (
    select 1 from public.channel_prompts p where p.conversation_id = c.id
  );

-- Unpaid accounts created on/after the Cohort 3 window that the old trigger
-- stamped as Cohort 2. Paid, comp, refunded, and admin rows stay put.
alter table public.profiles disable trigger profiles_protect_payment;
alter table public.profiles disable trigger profiles_protect_privileges_insert;

update public.profiles
set cohort_label = '2026-11'
where role = 'client'
  and coalesce(paid, false) = false
  and paid_at is null
  and coalesce(refunded, false) = false
  and coalesce(comp, false) = false
  and cohort_label is distinct from '2026-11'
  and created_at >= '2026-10-18T00:00:00.000Z';

alter table public.profiles enable trigger profiles_protect_payment;
alter table public.profiles enable trigger profiles_protect_privileges_insert;
