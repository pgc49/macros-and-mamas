-- Drop public anon/authenticated insert on public.waitlist
-- (pregnant / early-nursing eligibility holds).
-- Inserts must go through POST /api/intake-waitlist (service role + KV rate limit).
-- Live marketing / SPA waitlist already uses POST /api/waitlist → cohort_waitlist (041).

drop policy if exists "waitlist_insert_public" on public.waitlist;

-- Defense in depth: table grants still include INSERT for anon/authenticated
-- (Supabase defaults). RLS would block after the policy drop; revoke anyway
-- so a future policy cannot reopen a public write.
revoke insert, update, delete, truncate on table public.waitlist from anon, authenticated;
grant select on table public.waitlist to authenticated;
