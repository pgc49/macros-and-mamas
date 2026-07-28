-- ==================================================================
-- 026_message_attachments.sql
-- Optional image/PDF attachment on messages + private Storage bucket
-- ==================================================================

alter table public.messages
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists attachment_mime text,
  add column if not exists attachment_bytes integer;

comment on column public.messages.attachment_path is
  'Path in private message-attachments bucket: {client_id}/{uuid}-{filename}';

alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages
  add constraint messages_body_or_attachment_check check (
    char_length(trim(body)) <= 2000
    and (
      char_length(trim(body)) >= 1
      or (
        attachment_path is not null
        and char_length(trim(attachment_path)) between 1 and 500
      )
    )
  );

alter table public.messages drop constraint if exists messages_attachment_path_check;
alter table public.messages
  add constraint messages_attachment_path_check check (
    attachment_path is null
    or (
      char_length(trim(attachment_path)) between 1 and 500
      and attachment_path like (client_id::text || '/%')
    )
  );

-- Recreate insert policy so attachment-only messages are allowed.
drop policy if exists "messages_insert_own" on public.messages;
create policy "messages_insert_own"
  on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and (
      public.is_admin()
      or (auth.uid() = client_id and sender_id = client_id)
    )
    and char_length(trim(body)) <= 2000
    and (
      char_length(trim(body)) >= 1
      or (
        attachment_path is not null
        and char_length(trim(attachment_path)) between 1 and 500
        and attachment_path like (client_id::text || '/%')
      )
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-attachments',
  'message-attachments',
  false,
  10485760, -- 10 MB
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif',
    'application/pdf'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Path layout: {client_id}/{uuid}-{filename}
-- Mama may upload/read only under her own client_id folder.
-- Admins may upload/read any thread folder.

drop policy if exists "message_attachments_insert" on storage.objects;
create policy "message_attachments_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'message-attachments'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );

drop policy if exists "message_attachments_select" on storage.objects;
create policy "message_attachments_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'message-attachments'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );

drop policy if exists "message_attachments_delete" on storage.objects;
create policy "message_attachments_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'message-attachments'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );
