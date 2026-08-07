-- Drop public anon/authenticated insert on cohort_waitlist.
-- Inserts must go through POST /api/waitlist (service role + KV rate limit).

drop policy if exists "cohort_waitlist_insert_public" on public.cohort_waitlist;
