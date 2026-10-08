-- ==================================================================
-- 20261008091000_estimate_calls_reserve.sql
-- Atomic estimate_calls reserve. One retry per request_id, 2 minutes,
-- own row only. Do not apply live until Patrick says so.
-- Kept off the isolated messaging CI schema unless that job copies it
-- with a bootstrap table (no estimate_calls in the messaging dump).
-- ==================================================================

alter table public.estimate_calls
  add column if not exists request_id text;

alter table public.estimate_calls
  add column if not exists retried_at timestamptz;

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
  claimed integer;
begin
  if p_profile_id is null or p_type is null or p_max is null or p_max < 1 then
    return false;
  end if;

  ticket := nullif(btrim(p_request_id), '');

  -- Lock first so two parallel retries cannot both claim reuse.
  perform pg_advisory_xact_lock(hashtext(p_profile_id::text || ':' || p_type));

  if ticket is not null then
    update public.estimate_calls
       set retried_at = now()
     where request_id = ticket
       and profile_id = p_profile_id
       and type = p_type
       and created_at >= now() - interval '2 minutes'
       and retried_at is null;
    get diagnostics claimed = row_count;
    if claimed > 0 then
      return true;
    end if;

    -- Any other existing match: refuse. Do not insert a second row.
    if exists (
      select 1 from public.estimate_calls
       where request_id = ticket
    ) then
      return false;
    end if;
  end if;

  select count(*) into used
    from public.estimate_calls
   where profile_id = p_profile_id
     and type = p_type
     and created_at >= now() - interval '24 hours';

  if used >= p_max then
    return false;
  end if;

  begin
    insert into public.estimate_calls (profile_id, type, request_id)
    values (p_profile_id, p_type, ticket);
    return true;
  exception
    when unique_violation then
      return false;
  end;
end;
$$;

revoke all on function public.reserve_estimate_call(uuid, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.reserve_estimate_call(uuid, text, integer, text)
  to service_role;

comment on function public.reserve_estimate_call(uuid, text, integer, text) is
  'Reserve one estimate_calls slot. Same request_id may retry once within 2 minutes on the caller''s own row.';
