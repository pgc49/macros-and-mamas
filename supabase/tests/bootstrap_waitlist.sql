-- Isolated CI: recreate public.waitlist as 004 left it (anon insert open).
-- 064 then drops that policy. Requires profiles + is_admin() from
-- bootstrap_messaging.sql.

create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  reason text not null check (reason in ('pregnant', 'early_nursing')),
  months_pp numeric,
  eligible_on date,
  profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.waitlist enable row level security;

drop policy if exists "waitlist_insert_public" on public.waitlist;
create policy "waitlist_insert_public"
  on public.waitlist for insert
  to anon, authenticated
  with check (true);

drop policy if exists "waitlist_select_admin" on public.waitlist;
create policy "waitlist_select_admin"
  on public.waitlist for select
  to authenticated
  using (public.is_admin());

grant select, insert, update, delete on public.waitlist to anon, authenticated;
grant all on public.waitlist to service_role;
