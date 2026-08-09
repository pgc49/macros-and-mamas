-- Clients must not claim/suppress push by setting notified_at themselves.
-- Only service_role (channel-notify claim) may advance it.

create or replace function public.protect_conversation_message_edits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  -- Once deleted, non-service cannot undelete / restore body.
  if old.deleted_at is not null then
    return old;
  end if;

  new.conversation_id := old.conversation_id;
  new.sender_id := old.sender_id;
  new.kind := old.kind;
  new.created_at := old.created_at;
  new.reply_to_id := old.reply_to_id;
  -- Freeze notify claim — never settable from client/admin JWT.
  new.notified_at := old.notified_at;

  if new.deleted_at is not null and old.deleted_at is null then
    if not public.is_admin() and new.sender_id is distinct from auth.uid() then
      raise exception 'only sender or admin may delete';
    end if;
    new.body := '';
    new.attachment_path := null;
    new.attachment_name := null;
    new.attachment_mime := null;
    new.attachment_bytes := null;
    return new;
  end if;

  if new.body is distinct from old.body then
    if not public.is_admin() and old.sender_id is distinct from auth.uid() then
      raise exception 'only sender or admin may edit';
    end if;
    new.edited_at := now();
  end if;

  if not public.is_admin() then
    new.attachment_path := old.attachment_path;
    new.attachment_name := old.attachment_name;
    new.attachment_mime := old.attachment_mime;
    new.attachment_bytes := old.attachment_bytes;
  end if;

  return new;
end;
$$;
