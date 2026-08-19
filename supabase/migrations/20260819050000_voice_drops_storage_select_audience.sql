-- ==================================================================
-- 20260819050000_voice_drops_storage_select_audience.sql
--
-- Live hole (034): voice_drops_storage_select was
--   USING (bucket_id = 'voice-drops')
-- for every authenticated user. Table RLS is audience-scoped
-- (admins / active+cohort / all_mamas, plus published + unexpired).
-- createSignedUrl / list / download all honor storage RLS, so any
-- signed-in mama could read every object in the bucket — other
-- cohorts, superseded, expired, and admins-only takes.
--
-- Close: SELECT an object only when the caller is an admin (Callie
-- publish/preview, including orphans before the row exists) or when
-- a voice_drops row they can already SELECT points at that path.
-- voice_drops RLS stays the audience source of truth, so playback
-- for allowed mamas and Monday publish keep working.
--
-- Other private buckets (message-attachments, channel-attachments,
-- support-screenshots) are already path-scoped. avatars is public
-- on purpose.
-- ==================================================================

create index if not exists voice_drops_audio_path_idx
  on public.voice_drops (audio_path);

drop policy if exists "voice_drops_storage_select" on storage.objects;
create policy "voice_drops_storage_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'voice-drops'
    and (
      public.is_admin()
      or exists (
        select 1
        from public.voice_drops vd
        where vd.audio_path = name
      )
    )
  );
