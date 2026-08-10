-- ==================================================================
-- 056_custom_goals.sql
-- Mama-authored habit goals (Slice A). Completions still use checkins
-- with item_id = custom_goals.id::text. Program goals stay DEFAULT_ITEMS.
-- Does NOT modify or delete existing checkins.
-- ==================================================================

create table if not exists public.custom_goals (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0 and char_length(title) <= 30),
  subtitle text null check (subtitle is null or char_length(subtitle) <= 20),
  -- daily | n_per_week
  frequency text not null check (frequency in ('daily', 'n_per_week')),
  n_target int null check (
    (frequency = 'daily' and n_target is null)
    or (frequency = 'n_per_week' and n_target in (3, 5))
  ),
  sort int not null default 100,
  archived_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists custom_goals_profile_active_idx
  on public.custom_goals (profile_id, created_at)
  where archived_at is null;

create index if not exists custom_goals_profile_all_idx
  on public.custom_goals (profile_id);

comment on table public.custom_goals is
  'Mama custom habit goals (max 3 active). Checks stored in checkins.item_id = id.';

alter table public.custom_goals enable row level security;

drop policy if exists "custom_goals_select_own" on public.custom_goals;
create policy "custom_goals_select_own"
  on public.custom_goals for select
  to authenticated
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists "custom_goals_insert_own" on public.custom_goals;
create policy "custom_goals_insert_own"
  on public.custom_goals for insert
  to authenticated
  with check (profile_id = auth.uid());

drop policy if exists "custom_goals_update_own" on public.custom_goals;
create policy "custom_goals_update_own"
  on public.custom_goals for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- Soft-archive via update; hard delete not needed for members.
drop policy if exists "custom_goals_delete_own" on public.custom_goals;
create policy "custom_goals_delete_own"
  on public.custom_goals for delete
  to authenticated
  using (profile_id = auth.uid());

-- Cap: at most 3 active custom goals per mama (partial unique via trigger).
create or replace function public.enforce_custom_goals_cap()
returns trigger
language plpgsql
as $$
declare
  active_count int;
begin
  if NEW.archived_at is not null then
    return NEW;
  end if;
  select count(*)::int into active_count
  from public.custom_goals
  where profile_id = NEW.profile_id
    and archived_at is null
    and id is distinct from NEW.id;
  if active_count >= 3 then
    raise exception 'custom_goals_cap: max 3 active custom goals';
  end if;
  return NEW;
end;
$$;

drop trigger if exists custom_goals_cap_trg on public.custom_goals;
create trigger custom_goals_cap_trg
  before insert or update of archived_at, profile_id
  on public.custom_goals
  for each row
  execute function public.enforce_custom_goals_cap();
