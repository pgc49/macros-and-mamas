-- Stage 3 follow-up: stamp Founding Members cohort_label/tier.
-- Migration UPDATEs run as postgres (not service_role), so protect_payment_columns
-- was reverting cohort_label + tier. Disable those triggers for this backfill only.

alter table public.profiles disable trigger profiles_protect_payment;
alter table public.profiles disable trigger profiles_protect_privileges_insert;

update public.profiles p
set
  cohort_label = '2026-07',
  tier = 'active_pod'
where p.role = 'client'
  and p.paid = true
  and coalesce(p.refunded, false) = false
  and p.paid_at is not null
  and p.paid_at >= '2026-07-20T00:00:00Z'
  and p.paid_at < '2026-07-27T00:00:00Z';

alter table public.profiles enable trigger profiles_protect_payment;
alter table public.profiles enable trigger profiles_protect_privileges_insert;
