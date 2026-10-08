-- ==================================================================
-- 20261008100000_coach_request_id_and_refusal.sql
-- Add-only: request_id on coach_messages (mama payload stays empty).
-- Atomic client_summaries append for crisis / medical / stuck lines.
-- Do not apply live until Patrick says so.
-- No drops. No rewrites or backfills of existing rows.
-- ==================================================================

alter table public.coach_messages
  add column if not exists request_id text;

comment on column public.coach_messages.request_id is
  'Pairs a mama ask with its coach reply. uuid or 8-64 [A-Za-z0-9-].';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'coach_messages_request_id_check'
      and conrelid = 'public.coach_messages'::regclass
  ) then
    alter table public.coach_messages
      add constraint coach_messages_request_id_check
      check (
        request_id is null
        or request_id ~ '^[A-Za-z0-9-]{8,64}$'
      );
  end if;
end
$$;

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
     or new.request_id is distinct from old.request_id
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

create or replace function public.append_coach_refusal_line(
  p_profile_id uuid,
  p_for_date date,
  p_line text,
  p_door text,
  p_max integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_summary text;
  existing_touch text;
  existing_model text;
  has_row boolean;
  n integer;
  next_summary text;
begin
  p_line := left(btrim(p_line), 300);
  if p_profile_id is null or nullif(p_line, '') is null or nullif(btrim(p_door), '') is null then
    return jsonb_build_object('ok', false, 'skipped', true);
  end if;

  perform pg_advisory_xact_lock(
    hashtext(p_profile_id::text || ':coach_refusal:' || p_for_date::text)
  );

  select true, summary, suggested_touch, model
    into has_row, existing_summary, existing_touch, existing_model
    from public.client_summaries
   where profile_id = p_profile_id
     and for_date = p_for_date
   for update;

  if coalesce(has_row, false) and position(p_line in coalesce(existing_summary, '')) > 0 then
    return jsonb_build_object('ok', true, 'unchanged', true);
  end if;

  select count(*)::integer
    into n
    from regexp_split_to_table(coalesce(existing_summary, ''), E'\n') as line
   where line like ('Coach refused (' || p_door || '):%');

  if p_max is not null and n >= p_max then
    return jsonb_build_object('ok', true, 'capped', true);
  end if;

  if nullif(btrim(coalesce(existing_summary, '')), '') is null then
    next_summary := p_line;
  else
    next_summary := existing_summary || E'\n' || p_line;
    while length(next_summary) > 4000 loop
      if position(E'\n' in next_summary) = 0 then
        next_summary := p_line;
        exit;
      end if;
      next_summary := substring(next_summary from position(E'\n' in next_summary) + 1);
    end loop;
  end if;

  insert into public.client_summaries as cs (profile_id, for_date, summary, suggested_touch, model)
  values (p_profile_id, p_for_date, next_summary, existing_touch, existing_model)
  on conflict (profile_id, for_date) do update
    set summary = excluded.summary;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.append_coach_refusal_line(uuid, date, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.append_coach_refusal_line(uuid, date, text, text, integer)
  to service_role;

comment on function public.append_coach_refusal_line(uuid, date, text, text, integer) is
  'Atomic append of one Coach refused line. Dedupes identical text. Caps by door.';
