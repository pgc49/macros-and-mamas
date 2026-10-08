-- ==================================================================
-- 20261008090000_coach_priority_pass.sql
-- Empty hide hides nothing. Explicit clear-all. Thread index.
-- Atomic estimate_calls reserve. Do not apply live until Patrick says so.
-- ==================================================================

create index if not exists coach_messages_profile_date_seq_idx
  on public.coach_messages (profile_id, local_date, seq desc)
  where hidden_at is null;

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

  -- Empty array used to hide the whole thread. That is now a no-op.
  if ids is null or cardinality(ids) = 0 then
    return 0;
  end if;

  update public.coach_messages
     set hidden_at = now()
   where profile_id = auth.uid()
     and hidden_at is null
     and id = any (ids);

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.hide_coach_messages(uuid[]) from public, anon;
grant execute on function public.hide_coach_messages(uuid[]) to authenticated;

comment on function public.hide_coach_messages(uuid[]) is
  'Mama soft-hide. Own rows only. Empty ids hides nothing.';

create or replace function public.clear_coach_messages()
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

  update public.coach_messages
     set hidden_at = now()
   where profile_id = auth.uid()
     and hidden_at is null;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.clear_coach_messages() from public, anon;
grant execute on function public.clear_coach_messages() to authenticated;

comment on function public.clear_coach_messages() is
  'Mama soft-hide of every visible row she owns. Explicit clear-all.';

alter table public.estimate_calls
  add column if not exists request_id text;

create unique index if not exists estimate_calls_request_id_idx
  on public.estimate_calls (request_id)
  where request_id is not null;

create or replace function public.reserve_estimate_call(
  p_profile_id uuid,
  p_type text,
  p_max integer,
  p_request_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  used integer;
  ticket text;
begin
  if p_profile_id is null or p_type is null or p_max is null or p_max < 1 then
    return false;
  end if;

  ticket := nullif(btrim(p_request_id), '');

  if ticket is not null then
    if exists (
      select 1 from public.estimate_calls
       where request_id = ticket
    ) then
      return true;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext(p_profile_id::text || ':' || p_type));

  select count(*) into used
    from public.estimate_calls
   where profile_id = p_profile_id
     and type = p_type
     and created_at >= now() - interval '24 hours';

  if used >= p_max then
    return false;
  end if;

  insert into public.estimate_calls (profile_id, type, request_id)
  values (p_profile_id, p_type, ticket);
  return true;
end;
$$;

revoke all on function public.reserve_estimate_call(uuid, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.reserve_estimate_call(uuid, text, integer, text)
  to service_role;

comment on function public.reserve_estimate_call(uuid, text, integer, text) is
  'Atomically reserve one estimate_calls slot. Same request_id is a no-op reuse.';
