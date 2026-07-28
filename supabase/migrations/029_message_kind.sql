-- Optional message kind for admin broadcasts (chat | announcement).
alter table public.messages
  add column if not exists kind text not null default 'chat';

alter table public.messages
  drop constraint if exists messages_kind_check;

alter table public.messages
  add constraint messages_kind_check
  check (kind in ('chat', 'announcement'));

comment on column public.messages.kind is
  'chat = normal DM; announcement = admin broadcast shown as a Callie update.';

-- Keep kind immutable with other identity fields.
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
     or NEW.kind is distinct from OLD.kind
     or NEW.attachment_path is distinct from OLD.attachment_path
     or NEW.attachment_name is distinct from OLD.attachment_name
     or NEW.attachment_mime is distinct from OLD.attachment_mime
     or NEW.attachment_bytes is distinct from OLD.attachment_bytes
  then
    raise exception 'message identity and attachments are immutable';
  end if;

  if (NEW.body is distinct from OLD.body
      or NEW.edited_at is distinct from OLD.edited_at
      or NEW.deleted_at is distinct from OLD.deleted_at)
     and auth.uid() is distinct from OLD.sender_id
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

  return NEW;
end;
$$;
