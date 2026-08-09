-- Defense-in-depth: credit_ledger / stripe_events are service-role write only.
-- RLS already denies client INSERT/UPDATE/DELETE (no policies), but default
-- Supabase grants still include those privileges. Revoke them so a future RLS
-- mistake cannot become a money bug.

revoke all on table public.credit_ledger from anon, authenticated;
grant select on table public.credit_ledger to authenticated;

revoke all on table public.stripe_events from anon, authenticated;
grant select on table public.stripe_events to authenticated;

-- Table owner bypasses RLS unless forced; keep policies authoritative.
alter table public.credit_ledger force row level security;
alter table public.stripe_events force row level security;
