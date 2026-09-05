-- Messaging scale: indexes that serve unread-dot checks and keyset paging,
-- plus an inbox RPC that finds each thread's latest row with DISTINCT ON
-- instead of a DISTINCT scan plus a per-thread latest-message lateral.

-- Live (not-deleted) messages, newest first. channelHasUnreadMessages asks
-- for one row newer than last_read_at; loadChannelMessages pages on the
-- same key. Without the deleted_at predicate the planner still had to
-- walk tombstones in a busy August group.
create index if not exists conversation_messages_live_created_id_idx
  on public.conversation_messages (conversation_id, created_at desc, id desc)
  where deleted_at is null;

-- Same shape for DM unread counts and inbound-only dots. The existing
-- messages_client_unread_idx only covers (client_id, read_at) and still
-- includes deleted rows.
create index if not exists messages_client_unread_live_idx
  on public.messages (client_id, created_at desc)
  where read_at is null and deleted_at is null;

create or replace function public.load_admin_message_inbox()
returns table (
  client_id uuid,
  last_message jsonb,
  unread bigint,
  participant_ids uuid[]
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
  with latest as (
    -- One index walk per thread via (client_id, created_at desc, id desc).
    -- The previous DISTINCT + lateral latest scanned messages twice.
    select distinct on (m.client_id)
      m.id,
      m.client_id,
      m.sender_id,
      m.body,
      m.kind,
      m.created_at,
      m.read_at,
      m.edited_at,
      m.deleted_at,
      m.attachment_path,
      m.attachment_name,
      m.attachment_mime,
      m.attachment_bytes
    from public.messages m
    order by m.client_id, m.created_at desc, m.id desc
  )
  select
    latest.client_id,
    to_jsonb(latest) as last_message,
    coalesce(unread_count.total, 0)::bigint as unread,
    coalesce(participants.ids, array[latest.client_id]::uuid[]) as participant_ids
  from latest
  left join lateral (
    select count(*)::bigint as total
    from public.messages m
    where m.client_id = latest.client_id
      and m.deleted_at is null
      and m.read_at is null
      and m.sender_id <> auth.uid()
      and (
        not exists (
          select 1
          from public.profiles sender
          where sender.id = m.sender_id
            and sender.role = 'admin'
        )
        or exists (
          select 1
          from public.profiles client
          where client.id = latest.client_id
            and client.role = 'admin'
        )
      )
  ) unread_count on true
  left join lateral (
    select array_agg(distinct ids.id) filter (where ids.id is not null) as ids
    from (
      select m.sender_id as id
      from public.messages m
      where m.client_id = latest.client_id
      union all
      select latest.client_id
    ) ids
  ) participants on true
  order by latest.created_at desc, latest.id desc;
end;
$$;

revoke all on function public.load_admin_message_inbox() from public, anon;
grant execute on function public.load_admin_message_inbox() to authenticated;

comment on function public.load_admin_message_inbox() is
  'Admin-only, RLS-respecting latest message and unread count per DM thread.';

comment on index public.conversation_messages_live_created_id_idx is
  'Newest live row per channel — unread-dot check and keyset paging.';

comment on index public.messages_client_unread_live_idx is
  'Unread inbound DMs, excluding soft-deletes.';
