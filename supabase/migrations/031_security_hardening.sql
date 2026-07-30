-- ==================================================================
-- 031_security_hardening.sql
-- Soft-delete scrub, freeze approved macros / status / week,
-- constrain messages.kind on insert, notify idempotency column.
-- Safe for existing clients — no UI contract changes.
-- ==================================================================

-- ---------------------------------------------------------------------------
-- 1. Soft-delete scrubs body + attachment metadata (storage cleaned client-side)
-- ---------------------------------------------------------------------------
create or replace function public.protect_message_edits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.sender_id is distinct from OLD.sender_id
     or NEW.client_id is distinct from OLD.client_id
     or NEW.created_at is distinct from OLD.created_at
  then
    raise exception 'message identity is immutable';
  end if;

  -- Soft-delete: scrub content so "Message deleted" is real privacy.
  if NEW.deleted_at is not null and OLD.deleted_at is null then
    NEW.body := '';
    NEW.attachment_path := null;
    NEW.attachment_name := null;
    NEW.attachment_mime := null;
    NEW.attachment_bytes := null;
    NEW.edited_at := OLD.edited_at;
  elsif (
    NEW.attachment_path is distinct from OLD.attachment_path
    or NEW.attachment_name is distinct from OLD.attachment_name
    or NEW.attachment_mime is distinct from OLD.attachment_mime
    or NEW.attachment_bytes is distinct from OLD.attachment_bytes
  ) then
    raise exception 'message identity and attachments are immutable';
  end if;

  if (NEW.body is distinct from OLD.body
      or NEW.edited_at is distinct from OLD.edited_at
      or NEW.deleted_at is distinct from OLD.deleted_at)
     and auth.uid() is distinct from OLD.sender_id
     and auth.role() is distinct from 'service_role'
  then
    raise exception 'only the sender can edit or delete a message';
  end if;

  if NEW.deleted_at is null
     and char_length(trim(coalesce(NEW.body, ''))) = 0
     and NEW.attachment_path is null
  then
    raise exception 'message cannot be empty';
  end if;

  if char_length(trim(coalesce(NEW.body, ''))) > 2000 then
    raise exception 'message too long';
  end if;

  -- kind immutable (also enforced in 029; keep here for soft-delete path)
  if NEW.kind is distinct from OLD.kind then
    raise exception 'message kind is immutable';
  end if;

  return NEW;
end;
$$;

drop trigger if exists messages_protect_edits on public.messages;
create trigger messages_protect_edits
  before update on public.messages
  for each row
  execute function public.protect_message_edits();

-- Idempotent push/email notify (Pages Function sets after first successful notify)
alter table public.messages
  add column if not exists notified_at timestamptz;

comment on column public.messages.notified_at is
  'Set after /api/message-notify succeeds once — blocks notify spam.';

-- ---------------------------------------------------------------------------
-- 2. Mama cannot spoof announcements on insert
-- ---------------------------------------------------------------------------
drop policy if exists "messages_insert_own" on public.messages;
create policy "messages_insert_own"
  on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and (
      public.is_admin()
      or (auth.uid() = client_id and sender_id = client_id)
    )
    and (
      kind = 'chat'
      or (public.is_admin() and kind = 'announcement')
    )
    and char_length(trim(body)) <= 2000
    and (
      char_length(trim(body)) >= 1
      or (
        attachment_path is not null
        and char_length(trim(attachment_path)) between 1 and 500
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Freeze status + week for non-admins; keep payment locks
-- ---------------------------------------------------------------------------
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
  -- Clients cannot promote OR demote status / jump weeks
  new.status := old.status;
  new.week := old.week;
  return new;
end;
$$;

drop trigger if exists profiles_protect_payment on public.profiles;
create trigger profiles_protect_payment
  before update on public.profiles
  for each row execute function public.protect_payment_columns();

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

  new.paid := old.paid;
  new.refunded := old.refunded;
  new.stripe_customer_id := old.stripe_customer_id;
  new.stripe_payment_intent := old.stripe_payment_intent;
  new.paid_at := old.paid_at;
  new.role := old.role;
  new.status := old.status;
  new.week := old.week;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. After Callie approves, mama cannot rewrite macro numbers
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
    if old.approved is true then
      new.cal := old.cal;
      new.protein := old.protein;
      new.fat := old.fat;
      new.carbs := old.carbs;
      new.notes := old.notes;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists macros_protect_approval on public.macros;
create trigger macros_protect_approval
  before insert or update on public.macros
  for each row execute function public.protect_macros_approval();
