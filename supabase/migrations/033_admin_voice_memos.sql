-- ==================================================================
-- 033_admin_voice_memos.sql
-- Allow audio in message-attachments; only admins may send voice memos
-- ==================================================================

-- Expand bucket MIME allowlist (images/PDF unchanged + common recorder formats)
update storage.buckets
set allowed_mime_types = array[
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif',
  'application/pdf',
  'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/x-m4a', 'audio/aac'
]
where id = 'message-attachments';

-- Non-admins may still upload photo/PDF under their folder; audio upload is admin-only.
drop policy if exists "message_attachments_insert" on storage.objects;
create policy "message_attachments_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'message-attachments'
    and (
      public.is_admin()
      or (
        (storage.foldername(name))[1] = auth.uid()::text
        and coalesce(metadata->>'mimetype', '') !~* '^audio/'
      )
    )
  );

-- Reject mama inserts that attach audio (defense in depth beyond Storage).
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
    and (
      public.is_admin()
      or attachment_mime is null
      or attachment_mime !~* '^audio/'
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
