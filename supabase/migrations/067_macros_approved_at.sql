-- Personal program week starts when Callie approves ranges.
-- New signups join the open enrollment group (Cohort 2 / 2026-08).

alter table public.macros
  add column if not exists approved_at timestamptz;

comment on column public.macros.approved_at is
  'When Callie approved ranges. Personal Week 1 starts this week. Null until approved.';

create or replace function public.protect_macros_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  if TG_OP = 'INSERT' then
    new.approved := false;
    new.approved_at := null;
  elsif TG_OP = 'UPDATE' then
    new.approved := old.approved;
    new.approved_at := old.approved_at;
    if old.approved is true then
      new.cal := old.cal;
      new.protein := old.protein;
      new.fat := old.fat;
      new.carbs := old.carbs;
      new.notes := old.notes;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  accepted text := new.raw_user_meta_data ->> 'terms_accepted_at';
  version text := new.raw_user_meta_data ->> 'terms_version';
begin
  insert into public.profiles (id, email, terms_accepted_at, terms_version, cohort_label)
  values (
    new.id,
    nullif(lower(trim(new.email)), ''),
    case when accepted is not null and accepted <> '' then accepted::timestamptz else null end,
    nullif(version, ''),
    '2026-08'
  );
  return new;
end;
$$;

-- Unlabeled clients who signed up during the C2 window belong in Cohort 2.
-- Migration UPDATEs run as postgres, so protect triggers revert cohort_label.
alter table public.profiles disable trigger profiles_protect_payment;
alter table public.profiles disable trigger profiles_protect_privileges_insert;

update public.profiles
set cohort_label = '2026-08'
where role = 'client'
  and cohort_label is null
  and created_at >= '2026-08-10T00:00:00.000Z';

alter table public.profiles enable trigger profiles_protect_payment;
alter table public.profiles enable trigger profiles_protect_privileges_insert;
