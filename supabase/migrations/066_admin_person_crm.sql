-- Admin CRM: snooze / mark-cold overrides, card-open touches, daily AI summaries.
-- Service role + admin JWT only. Do not expose to client role.

create table if not exists public.person_overrides (
  email_lower text primary key,
  snoozed_until timestamptz,
  marked_cold boolean not null default false,
  last_touch_at timestamptz,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table public.person_overrides is
  'Admin-only CRM overrides. Stages stay derived; this is snooze / cold / last touch.';

create table if not exists public.admin_touches (
  id uuid primary key default gen_random_uuid(),
  email_lower text not null,
  kind text not null,
  profile_id uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.admin_touches is
  'Callie opened a card or emailed/copied a lead. Used for hot-lead 24h.';

create index if not exists admin_touches_email_created_idx
  on public.admin_touches (email_lower, created_at desc);

create table if not exists public.client_summaries (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  for_date date not null,
  summary text not null,
  suggested_touch text,
  model text,
  created_at timestamptz not null default now(),
  primary key (profile_id, for_date)
);

comment on table public.client_summaries is
  'Cached admin AI summary. Generate-on-open, 24h by for_date. Never coach_note.';

alter table public.person_overrides enable row level security;
alter table public.admin_touches enable row level security;
alter table public.client_summaries enable row level security;

drop policy if exists "person_overrides_admin_all" on public.person_overrides;
create policy "person_overrides_admin_all"
  on public.person_overrides for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admin_touches_admin_all" on public.admin_touches;
create policy "admin_touches_admin_all"
  on public.admin_touches for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "client_summaries_admin_all" on public.client_summaries;
create policy "client_summaries_admin_all"
  on public.client_summaries for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on table public.person_overrides to authenticated;
grant select, insert on table public.admin_touches to authenticated;
grant select, insert, update, delete on table public.client_summaries to authenticated;
