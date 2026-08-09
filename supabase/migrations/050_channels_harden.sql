-- Stage 3 security harden: attachment path binding, sticky soft-delete,
-- reply same-conversation, tighter storage deletes.

-- Bind attachment_path folder to conversation_id (same idea as DM messages).
alter table public.conversation_messages
  drop constraint if exists conversation_messages_attachment_path_conv;

alter table public.conversation_messages
  add constraint conversation_messages_attachment_path_conv check (
    attachment_path is null
    or attachment_path like (conversation_id::text || '/%')
  );

-- Sticky soft-delete + reply same conversation
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
    if public.is_admin() and new.deleted_at is not null then
      -- admin may keep it deleted; no undelete via client
      return old;
    end if;
    return old;
  end if;

  new.conversation_id := old.conversation_id;
  new.sender_id := old.sender_id;
  new.kind := old.kind;
  new.created_at := old.created_at;
  new.reply_to_id := old.reply_to_id;
  new.notified_at := coalesce(old.notified_at, new.notified_at);

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

create or replace function public.enforce_channel_reply_same_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_conv uuid;
begin
  if new.reply_to_id is null then
    return new;
  end if;
  select conversation_id into parent_conv
  from public.conversation_messages
  where id = new.reply_to_id;
  if parent_conv is null or parent_conv is distinct from new.conversation_id then
    raise exception 'reply_to must be in the same conversation';
  end if;
  return new;
end;
$$;

drop trigger if exists conversation_messages_reply_same_conv on public.conversation_messages;
create trigger conversation_messages_reply_same_conv
  before insert or update of reply_to_id on public.conversation_messages
  for each row execute function public.enforce_channel_reply_same_conversation();

-- Tighten insert policy: attachment_path must match conversation folder.
drop policy if exists "conversation_messages_insert_member" on public.conversation_messages;
create policy "conversation_messages_insert_member"
  on public.conversation_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_active_conversation_member(conversation_id)
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and c.read_only = false
    )
    and (
      public.is_admin()
      or kind = 'chat'
    )
    and (
      public.is_admin()
      or attachment_mime is null
      or attachment_mime !~* '^audio/'
    )
    and (
      attachment_path is null
      or attachment_path like (conversation_id::text || '/' || auth.uid()::text || '/%')
      or (
        public.is_admin()
        and attachment_path like (conversation_id::text || '/%')
      )
    )
  );

-- Storage: path = {conversationId}/{userId}/{file}
-- Select: active member. Insert: own user folder. Delete: own folder or admin.
drop policy if exists "channel_attachments_select" on storage.objects;
create policy "channel_attachments_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'channel-attachments'
    and (
      public.is_admin()
      or public.is_active_conversation_member(((storage.foldername(name))[1])::uuid)
    )
  );

drop policy if exists "channel_attachments_insert" on storage.objects;
create policy "channel_attachments_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'channel-attachments'
    and public.is_active_conversation_member(((storage.foldername(name))[1])::uuid)
    and (storage.foldername(name))[2] = auth.uid()::text
    and (
      public.is_admin()
      or coalesce(metadata->>'mimetype', '') !~* '^audio/'
    )
  );

drop policy if exists "channel_attachments_delete" on storage.objects;
create policy "channel_attachments_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'channel-attachments'
    and (
      public.is_admin()
      or (
        public.is_active_conversation_member(((storage.foldername(name))[1])::uuid)
        and (storage.foldername(name))[2] = auth.uid()::text
      )
    )
  );
