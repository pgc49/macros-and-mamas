-- ==================================================================
-- 20261008060000_coach_messages_admin_hide.sql
-- Soft-hide for Callie, mama-only client inserts, no hard delete.
-- ==================================================================

alter table public.coach_messages
  add column if not exists hidden_at timestamptz;

comment on column public.coach_messages.hidden_at is
  'Mama hide. The row stays for admins. She cannot see or restore it.';

create index if not exists coach_messages_profile_visible_idx
  on public.coach_messages (profile_id, seq desc)
  where hidden_at is null;

-- Own visible rows, or every row when public.is_admin().
drop policy if exists "coach_messages_select_own_or_admin" on public.coach_messages;
drop policy if exists "coach_messages_select_own_visible_or_admin" on public.coach_messages;
create policy "coach_messages_select_own_visible_or_admin"
  on public.coach_messages for select
  to authenticated
  using (
    (profile_id = auth.uid() and hidden_at is null)
    or public.is_admin()
  );

-- A mama session may only insert her own mama-role rows.
-- Coach / assistant rows are written by the service role in /api/coach.
drop policy if exists "coach_messages_insert_own" on public.coach_messages;
drop policy if exists "coach_messages_insert_own_mama" on public.coach_messages;
create policy "coach_messages_insert_own_mama"
  on public.coach_messages for insert
  to authenticated
  with check (
    profile_id = auth.uid()
    and role = 'mama'
  );

-- Soft-hide only. Hard DELETE is gone for authenticated clients.
drop policy if exists "coach_messages_delete_own" on public.coach_messages;
revoke delete on table public.coach_messages from anon, authenticated;

drop policy if exists "coach_messages_hide_own" on public.coach_messages;
create policy "coach_messages_hide_own"
  on public.coach_messages for update
  to authenticated
  using (profile_id = auth.uid() and hidden_at is null)
  with check (profile_id = auth.uid());

grant select, insert, update on table public.coach_messages to authenticated;

create or replace function public.protect_coach_message_hide()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.profile_id is distinct from old.profile_id
     or new.role is distinct from old.role
     or new.body is distinct from old.body
     or new.kind is distinct from old.kind
     or new.payload is distinct from old.payload
     or new.local_date is distinct from old.local_date
     or new.created_at is distinct from old.created_at
     or new.seq is distinct from old.seq
  then
    raise exception 'coach_messages are append-only except hidden_at';
  end if;

  if old.hidden_at is not null then
    raise exception 'hidden coach_messages cannot be changed';
  end if;

  if new.hidden_at is null then
    raise exception 'coach_messages can only be hidden, not restored';
  end if;

  return new;
end;
$$;

drop trigger if exists coach_messages_protect_hide on public.coach_messages;
create trigger coach_messages_protect_hide
  before update on public.coach_messages
  for each row
  execute function public.protect_coach_message_hide();

revoke all on function public.protect_coach_message_hide() from public, anon, authenticated;
