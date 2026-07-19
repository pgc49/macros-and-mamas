-- Record when a mama accepts the Terms at signup.
-- Run in Supabase SQL editor if not applied via migration tooling.

alter table public.profiles
  add column if not exists terms_accepted_at timestamptz;

alter table public.profiles
  add column if not exists terms_version text;

comment on column public.profiles.terms_accepted_at is
  'When the user checked “I agree” to the Terms at account creation';

comment on column public.profiles.terms_version is
  'Effective date of the Terms version accepted (e.g. 2026-07-18)';

-- Copy acceptance from auth signup metadata when the profile row is created.
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
  insert into public.profiles (id, terms_accepted_at, terms_version)
  values (
    new.id,
    case when accepted is not null and accepted <> '' then accepted::timestamptz else null end,
    nullif(version, '')
  );
  return new;
end;
$$;
