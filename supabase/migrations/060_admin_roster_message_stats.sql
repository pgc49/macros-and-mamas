-- Admin roster: last time Callie messaged each mama + unread mama→Callie count.
-- Used by the Clients tab so Callie can prioritize who needs a reply (mobile).

create index if not exists messages_client_admin_created_idx
  on public.messages (client_id, created_at desc, id desc)
  where deleted_at is null;

create or replace function public.admin_roster_message_stats()
returns table (
  client_id uuid,
  last_admin_at timestamptz,
  unread_from_mama integer
)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin required' using errcode = '42501';
  end if;

  return query
  select
    p.id as client_id,
    last_admin.created_at as last_admin_at,
    coalesce(unread.total, 0)::integer as unread_from_mama
  from public.profiles p
  left join lateral (
    select m.created_at
    from public.messages m
    inner join public.profiles s on s.id = m.sender_id
    where m.client_id = p.id
      and m.deleted_at is null
      and s.role = 'admin'
    order by m.created_at desc, m.id desc
    limit 1
  ) last_admin on true
  left join lateral (
    select count(*)::integer as total
    from public.messages m
    where m.client_id = p.id
      and m.deleted_at is null
      and m.read_at is null
      and m.sender_id = p.id
  ) unread on true
  where p.role is distinct from 'admin';
end;
$$;

revoke all on function public.admin_roster_message_stats() from public, anon;
grant execute on function public.admin_roster_message_stats() to authenticated;

comment on function public.admin_roster_message_stats() is
  'Admin-only: last outbound DM from an admin per mama, plus unread mama→Callie count.';

grant select on table public.marketing_leads to authenticated;
drop policy if exists marketing_leads_admin_select on public.marketing_leads;
create policy marketing_leads_admin_select
  on public.marketing_leads for select to authenticated
  using (public.is_admin());
