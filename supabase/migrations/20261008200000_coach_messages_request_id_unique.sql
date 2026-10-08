-- ==================================================================
-- 20261008200000_coach_messages_request_id_unique.sql
-- Add-only: one coach reply per (profile_id, request_id).
-- Do not apply live until Patrick says so.
-- No drops. No rewrites or backfills of existing rows.
-- ==================================================================

create unique index if not exists coach_messages_profile_request_id_uidx
  on public.coach_messages (profile_id, request_id)
  where request_id is not null and role = 'coach';
