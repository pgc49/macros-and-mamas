-- ==================================================================
-- 20261008070000_coach_messages_hide_rpc.sql
-- Hide via SECURITY DEFINER RPC. No mama UPDATE. Server stamps inserts.
-- ==================================================================

alter table public.coach_messages
  add column if not exists source text not null default 'server';

alter table public.coach_messages
  drop constraint if exists coach_messages_source_check;

alter table public.coach_messages
  add constraint coach_messages_source_check
  check (source in ('server', 'client'));

comment on column public.coach_messages.source is
  'server = written by /api/coach from its own output or a rebuilt template. '
  'client = local cards/read the server could not rebuild. Pins ignore client.';

drop policy if exists "coach_messages_hide_own" on public.coach_messages;
revoke update on table public.coach_messages from anon, authenticated;

create or replace function public.protect_coach_message_hide()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id is distinct from old.id
     or new.profile_id is distinct from old.profile_id
     or new.role is distinct from old.role
     or new.body is distinct from old.body
     or new.kind is distinct from old.kind
     or new.payload is distinct from old.payload
     or new.local_date is distinct from old.local_date
     or new.created_at is distinct from old.created_at
     or new.seq is distinct from old.seq
     or new.source is distinct from old.source
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

create or replace function public.protect_coach_message_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.hidden_at := null;
  new.created_at := now();
  new.seq := nextval(pg_get_serial_sequence('public.coach_messages', 'seq'));
  return new;
end;
$$;

drop trigger if exists coach_messages_protect_insert on public.coach_messages;
create trigger coach_messages_protect_insert
  before insert on public.coach_messages
  for each row
  execute function public.protect_coach_message_insert();

revoke all on function public.protect_coach_message_insert() from public, anon, authenticated;

create or replace function public.hide_coach_messages(ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if ids is null or cardinality(ids) = 0 then
    update public.coach_messages
       set hidden_at = now()
     where profile_id = auth.uid()
       and hidden_at is null;
  else
    update public.coach_messages
       set hidden_at = now()
     where profile_id = auth.uid()
       and hidden_at is null
       and id = any (ids);
  end if;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.hide_coach_messages(uuid[]) from public, anon;
grant execute on function public.hide_coach_messages(uuid[]) to authenticated;

comment on function public.hide_coach_messages(uuid[]) is
  'Mama soft-hide. Own rows only. hidden_at is now(). Empty ids hides all her visible rows.';
