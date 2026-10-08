-- ==================================================================
-- 20261008091000_estimate_calls_reserve.sql
-- Atomic estimate_calls reserve + request_id reuse.
-- Do not apply live until Patrick says so.
-- Kept off the isolated messaging CI schema (no estimate_calls table there).
-- ==================================================================

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
