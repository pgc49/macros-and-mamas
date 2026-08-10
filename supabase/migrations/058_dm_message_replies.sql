-- ==================================================================
-- 058_dm_message_replies.sql
-- Reply-to (quote) on 1:1 mama↔ Callie messages — same UX as channels.
-- ==================================================================

alter table public.messages
  add column if not exists reply_to_id uuid null references public.messages (id) on delete set null;

create index if not exists messages_reply_to_idx
  on public.messages (reply_to_id)
  where reply_to_id is not null;

comment on column public.messages.reply_to_id is
  'Optional quote/reply target in the same 1:1 thread (same client_id).';

-- Parent must live in the same mama thread.
create or replace function public.enforce_dm_reply_same_thread()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_client uuid;
begin
  if new.reply_to_id is null then
    return new;
  end if;
  select client_id into parent_client
  from public.messages
  where id = new.reply_to_id;
  if parent_client is null or parent_client is distinct from new.client_id then
    raise exception 'reply_to must be in the same thread';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_enforce_reply_thread on public.messages;
create trigger messages_enforce_reply_thread
  before insert or update of reply_to_id on public.messages
  for each row
  execute function public.enforce_dm_reply_same_thread();

revoke all on function public.enforce_dm_reply_same_thread() from public;
revoke all on function public.enforce_dm_reply_same_thread() from anon, authenticated;

-- Freeze reply_to_id on edit (identity-like).
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
     or NEW.reply_to_id is distinct from OLD.reply_to_id
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

revoke all on function public.protect_message_edits() from public;
revoke all on function public.protect_message_edits() from anon, authenticated;
