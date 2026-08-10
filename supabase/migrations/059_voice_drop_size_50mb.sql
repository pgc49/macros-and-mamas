-- ==================================================================
-- 059_voice_drop_size_50mb.sql
-- Monday voice drops: raise Storage limit from 10 MB → 50 MB.
-- (~10 min phone recordings often exceed 10 MB in webm/m4a.)
-- ==================================================================

update storage.buckets
set file_size_limit = 52428800 -- 50 MB
where id = 'voice-drops';
