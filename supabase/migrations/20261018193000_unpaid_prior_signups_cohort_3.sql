-- Unpaid, non-comp clients who signed up before Cohort 3 still carry an
-- older label (or none). Paying now joins November. Paid, refunded, comp,
-- and admin rows stay put.

alter table public.profiles disable trigger profiles_protect_payment;
alter table public.profiles disable trigger profiles_protect_privileges_insert;

update public.profiles
set cohort_label = '2026-11'
where role = 'client'
  and coalesce(paid, false) = false
  and paid_at is null
  and coalesce(refunded, false) = false
  and coalesce(comp, false) = false
  and cohort_label is distinct from '2026-11';

alter table public.profiles enable trigger profiles_protect_payment;
alter table public.profiles enable trigger profiles_protect_privileges_insert;
