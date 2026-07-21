-- Security locks: block admin escalation, self-approval, and profile delete/reinsert.
-- Run this entire file in the Supabase SQL editor (Dashboard → SQL → New query).

-- ---------------------------------------------------------------------------
-- 1. Profiles: no client delete; no client insert (signup trigger handles insert)
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_delete_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;

-- Belt-and-suspenders: if anything inserts/updates privileged columns as a
-- non-admin client, strip them. handle_new_user is SECURITY DEFINER (bypasses RLS).
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
    if new.status = 'active' then
      new.status := 'pending';
    end if;
    return new;
  end if;

  -- UPDATE path (also keep existing protect_payment_columns trigger)
  new.paid := old.paid;
  new.refunded := old.refunded;
  new.stripe_customer_id := old.stripe_customer_id;
  new.stripe_payment_intent := old.stripe_payment_intent;
  new.paid_at := old.paid_at;
  new.role := old.role;
  if new.status is distinct from old.status and new.status = 'active' then
    new.status := old.status;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_privileges_insert on public.profiles;
create trigger profiles_protect_privileges_insert
  before insert on public.profiles
  for each row execute function public.protect_profile_privileges();

-- Keep the existing UPDATE trigger behavior (idempotent replace).
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

-- ---------------------------------------------------------------------------
-- 2. Macros: clients cannot set approved = true (insert or update)
-- ---------------------------------------------------------------------------
create or replace function public.protect_macros_approval()
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
    new.approved := false;
  elsif TG_OP = 'UPDATE' then
    new.approved := old.approved;
  end if;
  return new;
end;
$$;

drop trigger if exists macros_protect_approval on public.macros;
create trigger macros_protect_approval
  before insert or update on public.macros
  for each row execute function public.protect_macros_approval();
