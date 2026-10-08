-- ==================================================================
-- 20261008090000_coach_priority_pass.sql
-- Empty hide hides nothing. Explicit clear-all. Thread index.
-- Do not apply live until Patrick says so.
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
