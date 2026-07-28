-- ==================================================================
-- 027_message_edit_delete.sql
-- Soft-delete + edit own messages; protect content from non-senders
-- ==================================================================

alter table public.messages
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz;

comment on column public.messages.edited_at is 'Set when sender edits body text.';
comment on column public.messages.deleted_at is 'Soft delete — row kept, UI shows Message deleted.';

-- Soft-deleted rows may have an empty body.
alter table public.messages drop constraint if exists messages_body_or_attachment_check;
alter table public.messages
  add constraint messages_body_or_attachment_check check (
    char_length(trim(body)) <= 2000
    and (
      deleted_at is not null
      or char_length(trim(body)) >= 1
      or (
        attachment_path is not null
        and char_length(trim(attachment_path)) between 1 and 500
      )
    )
  );

create index if not exists messages_client_deleted_idx
  on public.messages (client_id, deleted_at);

-- Non-senders may still mark read_at; only the sender may change body / soft-delete.
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

drop trigger if exists messages_protect_edits on public.messages;
create trigger messages_protect_edits
  before update on public.messages
  for each row
  execute function public.protect_message_edits();
