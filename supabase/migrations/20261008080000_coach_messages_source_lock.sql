-- ==================================================================
-- 20261008080000_coach_messages_source_lock.sql
-- Mama inserts cannot mint source=server or a pin-shaped payload.
-- ==================================================================

drop policy if exists "coach_messages_insert_own_mama" on public.coach_messages;
create policy "coach_messages_insert_own_mama"
  on public.coach_messages for insert
  to authenticated
  with check (
    profile_id = auth.uid()
    and role = 'mama'
    and kind in ('text', 'photo')
    and (payload is null or payload = '{}'::jsonb)
  );

create or replace function public.protect_coach_message_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  jwt_role text;
begin
  jwt_role := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(
      coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'role',
      ''
    ),
    ''
  );

  new.hidden_at := null;
  new.created_at := now();
  new.seq := nextval(pg_get_serial_sequence('public.coach_messages', 'seq'));

  -- Only the service-role JWT may mint source=server. A mama session,
  -- anon, or a no-JWT owner insert cannot.
  if jwt_role is distinct from 'service_role' then
    new.source := 'client';
  end if;

  if new.role = 'mama' then
    if new.kind is distinct from 'text' and new.kind is distinct from 'photo' then
      raise exception 'mama coach_messages kind must be text or photo';
    end if;
    if new.payload is not null and new.payload <> '{}'::jsonb then
      raise exception 'mama coach_messages payload must be empty';
    end if;
  end if;

  return new;
end;
$$;
