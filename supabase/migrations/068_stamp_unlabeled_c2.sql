-- 067's unlabeled C2 stamp was reverted by profiles_protect_* triggers.
-- Disable them for this backfill only. Does not move Founding members.

alter table public.profiles disable trigger profiles_protect_payment;
alter table public.profiles disable trigger profiles_protect_privileges_insert;

update public.profiles
set cohort_label = '2026-08'
where role = 'client'
  and cohort_label is null
  and created_at >= '2026-08-10T00:00:00.000Z';

alter table public.profiles enable trigger profiles_protect_payment;
alter table public.profiles enable trigger profiles_protect_privileges_insert;
