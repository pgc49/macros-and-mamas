-- Store signup email on profiles so admin can see unpaid / blank names.
-- Run this entire file in the Supabase SQL editor.

alter table public.profiles
  add column if not exists email text;

comment on column public.profiles.email is
  'Auth email copied at signup for admin roster (not used for login)';

create index if not exists profiles_email_idx
  on public.profiles (email);

-- Copy email (+ terms metadata) on every new auth user
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
  insert into public.profiles (id, email, terms_accepted_at, terms_version)
  values (
    new.id,
    nullif(lower(trim(new.email)), ''),
    case when accepted is not null and accepted <> '' then accepted::timestamptz else null end,
    nullif(version, '')
  );
  return new;
end;
$$;

-- Backfill existing profiles from auth.users
update public.profiles p
set email = lower(trim(u.email))
from auth.users u
where u.id = p.id
  and u.email is not null
  and u.email <> ''
  and (p.email is null or p.email = '');
