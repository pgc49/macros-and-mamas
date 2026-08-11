-- Tighten DM mutation and attachment ownership boundaries.

create or replace function public.protect_message_edits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  client_is_admin boolean;
begin
  if NEW.sender_id is distinct from OLD.sender_id
     or NEW.client_id is distinct from OLD.client_id
     or NEW.created_at is distinct from OLD.created_at
     or NEW.reply_to_id is distinct from OLD.reply_to_id
  then
    raise exception 'message identity is immutable';
  end if;

  if auth.role() is distinct from 'service_role'
     and NEW.notified_at is distinct from OLD.notified_at
  then
    raise exception 'notification state is server-managed';
  end if;

  if NEW.read_at is distinct from OLD.read_at then
    if NEW.read_at is null or OLD.read_at is not null then
      raise exception 'read receipt is monotonic';
    end if;
    if auth.role() is distinct from 'service_role' then
      if auth.uid() = OLD.sender_id then
        raise exception 'sender cannot mark own message read';
      end if;

      select exists (
        select 1
        from public.profiles p
        where p.id = OLD.client_id
          and p.role = 'admin'
      ) into client_is_admin;

      if client_is_admin then
        -- Admin-DM rows owned by the other participant have an explicit
        -- recipient. Owner-sent rows rely on the current two-admin model.
        if OLD.sender_id <> OLD.client_id and auth.uid() <> OLD.client_id then
          raise exception 'only the recipient can mark message read';
        end if;
        if OLD.sender_id = OLD.client_id and not public.is_admin() then
          raise exception 'only the recipient can mark message read';
        end if;
      elsif OLD.sender_id = OLD.client_id then
        -- Mama → coach: an admin recipient may acknowledge.
        if not public.is_admin() then
          raise exception 'only the recipient can mark message read';
        end if;
      elsif auth.uid() <> OLD.client_id then
        -- Coach → mama: only that mama may acknowledge.
        raise exception 'only the recipient can mark message read';
      end if;
    end if;
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

  if NEW.kind is distinct from OLD.kind then
    raise exception 'message kind is immutable';
  end if;

  return NEW;
end;
$$;

revoke all on function public.protect_message_edits() from public, anon, authenticated;

drop trigger if exists messages_protect_edits on public.messages;
create trigger messages_protect_edits
  before update on public.messages
  for each row execute function public.protect_message_edits();

-- A mama can read every attachment in her own thread, but can only delete an
-- object she uploaded. Admins retain moderation/cleanup access.
drop policy if exists "message_attachments_delete" on storage.objects;
create policy "message_attachments_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'message-attachments'
    and (
      public.is_admin()
      or owner_id = auth.uid()::text
    )
  );

