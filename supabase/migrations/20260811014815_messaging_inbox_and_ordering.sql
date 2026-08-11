-- Messaging P0: deterministic newest-window queries and an inbox query that
-- does not lose quiet threads after a global message-count threshold.

create index if not exists messages_client_created_id_idx
  on public.messages (client_id, created_at desc, id desc);

create index if not exists conversation_messages_conversation_created_id_idx
  on public.conversation_messages (conversation_id, created_at desc, id desc);

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
  with threads as (
    select distinct m.client_id
    from public.messages m
  )
  select
    t.client_id,
    to_jsonb(latest_message) as last_message,
    coalesce(unread_count.total, 0)::bigint as unread,
    coalesce(participants.ids, array[t.client_id]::uuid[]) as participant_ids
  from threads t
  cross join lateral (
    -- Latest activity remains the inbox source of truth, including a deletion
    -- tombstone ("Message deleted"), so ordering matches what just happened.
    select
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
    where m.client_id = t.client_id
    order by m.created_at desc, m.id desc
    limit 1
  ) latest_message
  left join lateral (
    select count(*)::bigint as total
    from public.messages m
    where m.client_id = t.client_id
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
          where client.id = m.client_id
            and client.role = 'admin'
        )
      )
  ) unread_count on true
  left join lateral (
    select array_agg(distinct ids.id) filter (where ids.id is not null) as ids
    from (
      select m.sender_id as id
      from public.messages m
      where m.client_id = t.client_id
      union all
      select t.client_id
    ) ids
  ) participants on true
  order by (latest_message.created_at) desc, (latest_message.id) desc;
end;
$$;

revoke all on function public.load_admin_message_inbox() from public, anon;
grant execute on function public.load_admin_message_inbox() to authenticated;

comment on function public.load_admin_message_inbox() is
  'Admin-only, RLS-respecting latest message and unread count per DM thread.';
