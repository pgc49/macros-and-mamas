-- Cheap group unread: stamp last_inbound_at on every other member when a
-- live message lands. The pill dot is then last_inbound_at > last_read_at
-- with no conversation_messages lookup.

alter table public.conversation_members
  add column if not exists last_inbound_at timestamptz;

create index if not exists conversation_members_user_inbound_idx
  on public.conversation_members (user_id, last_inbound_at desc)
  where removed_at is null;

create or replace function public.touch_conversation_last_inbound()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if new.deleted_at is not null then
    return new;
  end if;
  perform set_config('macros.inbox_touch', 'on', true);
  update public.conversation_members
    set last_inbound_at = new.created_at
    where conversation_id = new.conversation_id
      and user_id is distinct from new.sender_id
      and removed_at is null
      and (
        last_inbound_at is null
        or last_inbound_at < new.created_at
      );
  return new;
end;
$$;

drop trigger if exists conversation_messages_touch_inbound on public.conversation_messages;
create trigger conversation_messages_touch_inbound
  after insert on public.conversation_messages
  for each row execute function public.touch_conversation_last_inbound();

revoke all on function public.touch_conversation_last_inbound() from public, anon, authenticated;

-- Members must not forge last_inbound_at. The inbox trigger sets
-- macros.inbox_touch so its UPDATE is allowed through.
create or replace function public.protect_conversation_member_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' or public.is_admin() then
    return new;
  end if;
  new.conversation_id := old.conversation_id;
  new.user_id := old.user_id;
  new.joined_at := old.joined_at;
  new.removed_at := old.removed_at;
  if current_setting('macros.inbox_touch', true) is distinct from 'on' then
    new.last_inbound_at := old.last_inbound_at;
  end if;
  return new;
end;
$$;

-- Existing groups: seed last_inbound_at so unread dots stay honest after deploy.
update public.conversation_members m
set last_inbound_at = inbound.latest
from (
  select
    cm.conversation_id,
    cm.user_id,
    max(msg.created_at) as latest
  from public.conversation_members cm
  join public.conversation_messages msg
    on msg.conversation_id = cm.conversation_id
   and msg.deleted_at is null
   and msg.sender_id is distinct from cm.user_id
  group by cm.conversation_id, cm.user_id
) inbound
where m.conversation_id = inbound.conversation_id
  and m.user_id = inbound.user_id
  and m.last_inbound_at is distinct from inbound.latest;
