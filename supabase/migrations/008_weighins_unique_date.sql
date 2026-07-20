-- One weigh-in per day per client (matches day-strip logging UX).
-- Run in Supabase SQL editor if not applied via migration tooling.

-- Keep the newest row when duplicates exist for the same profile + date.
delete from public.weighins a
using public.weighins b
where a.profile_id = b.profile_id
  and a.date = b.date
  and a.ctid < b.ctid;

create unique index if not exists weighins_profile_date_unique
  on public.weighins (profile_id, date);
