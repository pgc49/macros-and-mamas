-- Pair-unique admin DMs. Additive; preserves every legacy client_id/path.

create table public.admin_dm_conversations (
  id uuid primary key default gen_random_uuid(),
  participant_low uuid not null references public.profiles(id) on delete restrict,
  participant_high uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint admin_dm_participants_ordered check (participant_low < participant_high),
  constraint admin_dm_pair_unique unique (participant_low, participant_high)
);

alter table public.admin_dm_conversations enable row level security;
revoke all on table public.admin_dm_conversations from public, anon;
grant select, insert on table public.admin_dm_conversations to authenticated;
grant all on table public.admin_dm_conversations to service_role;

create policy admin_dm_conversations_select
  on public.admin_dm_conversations for select to authenticated
  using (
    public.is_admin()
    and auth.uid() in (participant_low, participant_high)
  );

create policy admin_dm_conversations_insert
  on public.admin_dm_conversations for insert to authenticated
  with check (
    public.is_admin()
    and auth.uid() in (participant_low, participant_high)
    and participant_low < participant_high
    and exists (
      select 1 from public.profiles p
      where p.id = participant_low and p.role = 'admin'
    )
    and exists (
      select 1 from public.profiles p
      where p.id = participant_high and p.role = 'admin'
    )
  );

create table public.admin_dm_migration_state (
  singleton boolean primary key default true check (singleton),
  compatibility_enabled boolean not null default true,
  admin_provisioning_frozen boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.admin_dm_migration_state enable row level security;
revoke all on table public.admin_dm_migration_state from public, anon, authenticated;
grant select, update on table public.admin_dm_migration_state to service_role;
insert into public.admin_dm_migration_state (
  singleton,
  admin_provisioning_frozen
)
select true, (select count(*) >= 2 from public.profiles where role = 'admin')
on conflict (singleton) do nothing;

alter table public.messages
  add column if not exists admin_dm_conversation_id uuid null
    references public.admin_dm_conversations(id) on delete restrict,
  add column if not exists recipient_id uuid null
    references public.profiles(id) on delete set null,
  add column if not exists legacy_admin_attachment_path boolean not null default false;

create index messages_admin_dm_created_idx
  on public.messages (admin_dm_conversation_id, created_at desc, id desc)
  where admin_dm_conversation_id is not null;
create index messages_recipient_unread_idx
  on public.messages (recipient_id, created_at desc)
  where recipient_id is not null and read_at is null and deleted_at is null;

lock table public.messages in share row exclusive mode;

do $$
declare
  invalid_buckets integer;
begin
  with admin_buckets as (
    select m.client_id
    from public.messages m
    join public.profiles owner on owner.id = m.client_id and owner.role = 'admin'
    group by m.client_id
  ), members as (
    select b.client_id, b.client_id as member_id from admin_buckets b
    union
    select m.client_id, m.sender_id
    from public.messages m
    join admin_buckets b on b.client_id = m.client_id
    join public.profiles sender on sender.id = m.sender_id and sender.role = 'admin'
  ), counts as (
    select client_id, count(distinct member_id) as member_count
    from members group by client_id
  )
  select count(*) into invalid_buckets
  from counts where member_count <> 2;

  if invalid_buckets > 0 then
    raise exception 'admin DM legacy bucket does not map to exactly two admins';
  end if;
end;
$$;

with admin_buckets as (
  select m.client_id
  from public.messages m
  join public.profiles owner on owner.id = m.client_id and owner.role = 'admin'
  group by m.client_id
), members as (
  select b.client_id, b.client_id as member_id from admin_buckets b
  union
  select m.client_id, m.sender_id
  from public.messages m
  join admin_buckets b on b.client_id = m.client_id
  join public.profiles sender on sender.id = m.sender_id and sender.role = 'admin'
), bucket_pairs as (
  select client_id, array_agg(distinct member_id order by member_id) as ids
  from members group by client_id
)
insert into public.admin_dm_conversations (participant_low, participant_high)
select distinct ids[1], ids[2] from bucket_pairs
on conflict (participant_low, participant_high) do nothing;

with admin_buckets as (
  select m.client_id
  from public.messages m
  join public.profiles owner on owner.id = m.client_id and owner.role = 'admin'
  group by m.client_id
), members as (
  select b.client_id, b.client_id as member_id from admin_buckets b
  union
  select m.client_id, m.sender_id
  from public.messages m
  join admin_buckets b on b.client_id = m.client_id
  join public.profiles sender on sender.id = m.sender_id and sender.role = 'admin'
), bucket_pairs as (
  select client_id, array_agg(distinct member_id order by member_id) as ids
  from members group by client_id
), mapped as (
  select
    bp.client_id,
    c.id as conversation_id,
    c.participant_low,
    c.participant_high
  from bucket_pairs bp
  join public.admin_dm_conversations c
    on c.participant_low = bp.ids[1] and c.participant_high = bp.ids[2]
)
update public.messages m
set
  admin_dm_conversation_id = mapped.conversation_id,
  recipient_id = case
    when m.sender_id = mapped.participant_low then mapped.participant_high
    else mapped.participant_low
  end,
  legacy_admin_attachment_path = m.attachment_path is not null
from mapped
where m.client_id = mapped.client_id;

alter table public.admin_dm_conversations force row level security;

create or replace function public.ensure_admin_dm_conversation(peer_id uuid)
returns public.admin_dm_conversations
language plpgsql
security invoker
set search_path = public
as $$
declare
  low_id uuid;
  high_id uuid;
  result public.admin_dm_conversations;
begin
  if peer_id is null or peer_id = auth.uid() or not public.is_admin() then
    raise exception 'valid admin peer required';
  end if;
  if not exists (select 1 from public.profiles where id = peer_id and role = 'admin') then
    raise exception 'valid admin peer required';
  end if;
  low_id := least(auth.uid(), peer_id);
  high_id := greatest(auth.uid(), peer_id);
  insert into public.admin_dm_conversations (participant_low, participant_high)
  values (low_id, high_id)
  on conflict (participant_low, participant_high) do nothing;
  select * into result
  from public.admin_dm_conversations
  where participant_low = low_id and participant_high = high_id;
  return result;
end;
$$;
revoke all on function public.ensure_admin_dm_conversation(uuid) from public, anon;
grant execute on function public.ensure_admin_dm_conversation(uuid) to authenticated;

create or replace function private.set_dm_conversation_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_is_admin boolean;
  compat boolean;
  admin_count integer;
  admin_ids uuid[];
  conv public.admin_dm_conversations;
begin
  select p.role = 'admin' into owner_is_admin
  from public.profiles p where p.id = new.client_id;

  if new.admin_dm_conversation_id is null and coalesce(owner_is_admin, false) then
    select compatibility_enabled into compat
    from public.admin_dm_migration_state where singleton;
    select count(*) into admin_count from public.profiles where role = 'admin';
    if not coalesce(compat, false) or admin_count <> 2 then
      raise exception 'admin DM conversation required';
    end if;
    select * into conv
    from public.admin_dm_conversations
    where auth.uid() in (participant_low, participant_high)
    limit 1;
    if conv.id is null then
      select array_agg(id order by id) into admin_ids
      from public.profiles where role = 'admin';
      insert into public.admin_dm_conversations (participant_low, participant_high)
      values (admin_ids[1], admin_ids[2])
      on conflict (participant_low, participant_high) do nothing;
      select * into conv
      from public.admin_dm_conversations
      where participant_low = admin_ids[1] and participant_high = admin_ids[2];
    end if;
    new.admin_dm_conversation_id := conv.id;
    new.recipient_id := case
      when new.sender_id = conv.participant_low then conv.participant_high
      else conv.participant_low
    end;
    new.client_id := conv.participant_low;
    new.legacy_admin_attachment_path := new.attachment_path is not null;
  elsif new.admin_dm_conversation_id is not null then
    select * into conv from public.admin_dm_conversations
    where id = new.admin_dm_conversation_id;
    if conv.id is null
       or not public.is_admin()
       or new.sender_id not in (conv.participant_low, conv.participant_high)
       or new.recipient_id not in (conv.participant_low, conv.participant_high)
       or new.sender_id = new.recipient_id
    then
      raise exception 'invalid admin DM conversation identity';
    end if;
    new.client_id := conv.participant_low;
    if new.legacy_admin_attachment_path then
      raise exception 'legacy attachment stamp is migration-managed';
    end if;
  elsif new.sender_id <> new.client_id then
    new.recipient_id := new.client_id;
  else
    new.recipient_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists messages_set_dm_conversation_identity on public.messages;
create trigger messages_set_dm_conversation_identity
before insert on public.messages
for each row execute function private.set_dm_conversation_identity();
revoke all on function private.set_dm_conversation_identity() from public;

create or replace function private.freeze_admin_provisioning()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare frozen boolean; admin_count integer;
begin
  select admin_provisioning_frozen into frozen
  from public.admin_dm_migration_state where singleton;
  select count(*) into admin_count from public.profiles where role = 'admin';
  if coalesce(frozen, false)
     and new.role = 'admin'
     and (tg_op = 'INSERT' or old.role is distinct from 'admin')
     and admin_count >= 2
  then
    raise exception 'admin provisioning frozen during DM migration';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_freeze_admin_provisioning on public.profiles;
create trigger profiles_freeze_admin_provisioning
before insert or update of role on public.profiles
for each row execute function private.freeze_admin_provisioning();
revoke all on function private.freeze_admin_provisioning() from public;

alter table public.messages
  drop constraint if exists messages_attachment_path_check;
alter table public.messages
  add constraint messages_attachment_path_check check (
    attachment_path is null
    or (
      admin_dm_conversation_id is null
      and attachment_path like client_id::text || '/%'
    )
    or (
      admin_dm_conversation_id is not null
      and legacy_admin_attachment_path
    )
    or (
      admin_dm_conversation_id is not null
      and not legacy_admin_attachment_path
      and attachment_path like
        'admin-dm/' || admin_dm_conversation_id::text || '/' || sender_id::text || '/%'
    )
  );

create or replace function public.enforce_dm_reply_same_thread()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare parent_row public.messages;
begin
  if new.reply_to_id is null then return new; end if;
  select * into parent_row from public.messages where id = new.reply_to_id;
  if parent_row.id is null then raise exception 'reply target missing'; end if;
  if new.admin_dm_conversation_id is null then
    if parent_row.admin_dm_conversation_id is not null
       or parent_row.client_id is distinct from new.client_id then
      raise exception 'reply_to must be in the same thread';
    end if;
  elsif parent_row.admin_dm_conversation_id is distinct from new.admin_dm_conversation_id then
    raise exception 'reply_to must be in the same admin conversation';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_enforce_reply_thread on public.messages;
create trigger messages_enforce_reply_thread
before insert or update of reply_to_id on public.messages
for each row execute function public.enforce_dm_reply_same_thread();

create or replace function public.protect_message_edits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare conv public.admin_dm_conversations;
begin
  if new.sender_id is distinct from old.sender_id
     or new.client_id is distinct from old.client_id
     or new.created_at is distinct from old.created_at
     or new.reply_to_id is distinct from old.reply_to_id
     or new.admin_dm_conversation_id is distinct from old.admin_dm_conversation_id
     or new.recipient_id is distinct from old.recipient_id
     or new.legacy_admin_attachment_path is distinct from old.legacy_admin_attachment_path
     or new.client_message_id is distinct from old.client_message_id
  then raise exception 'message identity is immutable'; end if;

  if auth.role() is distinct from 'service_role'
     and new.notified_at is distinct from old.notified_at
  then raise exception 'notification state is server-managed'; end if;

  if new.read_at is distinct from old.read_at then
    if new.read_at is null or old.read_at is not null then
      raise exception 'read receipt is monotonic';
    end if;
    if auth.role() is distinct from 'service_role' then
      if old.admin_dm_conversation_id is not null then
        select * into conv from public.admin_dm_conversations
        where id = old.admin_dm_conversation_id;
        if not public.is_admin() or auth.uid() <> old.recipient_id
           or auth.uid() not in (conv.participant_low, conv.participant_high)
        then raise exception 'only recipient may mark admin DM read'; end if;
      elsif old.sender_id = old.client_id then
        if not public.is_admin() then raise exception 'only coach may mark read'; end if;
      elsif auth.uid() <> old.client_id then
        raise exception 'only mama recipient may mark read';
      end if;
    end if;
  end if;

  if new.deleted_at is not null and old.deleted_at is null then
    new.body := ''; new.attachment_path := null; new.attachment_name := null;
    new.attachment_mime := null; new.attachment_bytes := null;
    new.edited_at := old.edited_at;
  elsif new.attachment_path is distinct from old.attachment_path
     or new.attachment_name is distinct from old.attachment_name
     or new.attachment_mime is distinct from old.attachment_mime
     or new.attachment_bytes is distinct from old.attachment_bytes
  then raise exception 'message attachments are immutable'; end if;

  if (new.body is distinct from old.body
      or new.edited_at is distinct from old.edited_at
      or new.deleted_at is distinct from old.deleted_at)
     and auth.uid() is distinct from old.sender_id
     and auth.role() is distinct from 'service_role'
  then raise exception 'only sender can edit or delete'; end if;
  if new.kind is distinct from old.kind then raise exception 'message kind is immutable'; end if;
  if new.deleted_at is null and char_length(trim(coalesce(new.body, ''))) = 0
     and new.attachment_path is null then raise exception 'message cannot be empty'; end if;
  return new;
end;
$$;

revoke all on function public.protect_message_edits() from public, anon, authenticated;

drop trigger if exists messages_protect_edits on public.messages;
create trigger messages_protect_edits
before update on public.messages
for each row execute function public.protect_message_edits();

drop policy if exists "messages_select_thread" on public.messages;
create policy "messages_select_thread"
  on public.messages for select to authenticated
  using (
    (
      admin_dm_conversation_id is null
      and (public.is_admin() or auth.uid() = client_id)
    )
    or (
      admin_dm_conversation_id is not null
      and public.is_admin()
      and exists (
        select 1 from public.admin_dm_conversations c
        where c.id = admin_dm_conversation_id
          and auth.uid() in (c.participant_low, c.participant_high)
      )
    )
  );

drop policy if exists "messages_insert_own" on public.messages;
create policy "messages_insert_own"
  on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and (
      (
        admin_dm_conversation_id is null
        and (
          public.is_admin()
          or (auth.uid() = client_id and sender_id = client_id)
        )
      )
      or (
        admin_dm_conversation_id is not null
        and public.is_admin()
        and exists (
          select 1 from public.admin_dm_conversations c
          where c.id = admin_dm_conversation_id
            and auth.uid() in (c.participant_low, c.participant_high)
            and recipient_id in (c.participant_low, c.participant_high)
            and recipient_id <> auth.uid()
        )
      )
    )
  );

drop policy if exists "messages_update_read" on public.messages;
create policy "messages_update_read"
  on public.messages for update to authenticated
  using (
    (
      admin_dm_conversation_id is null
      and (public.is_admin() or auth.uid() = client_id)
    )
    or (
      admin_dm_conversation_id is not null
      and public.is_admin()
      and exists (
        select 1 from public.admin_dm_conversations c
        where c.id = admin_dm_conversation_id
          and auth.uid() in (c.participant_low, c.participant_high)
      )
    )
  )
  with check (
    (
      admin_dm_conversation_id is null
      and (public.is_admin() or auth.uid() = client_id)
    )
    or (
      admin_dm_conversation_id is not null
      and public.is_admin()
      and exists (
        select 1 from public.admin_dm_conversations c
        where c.id = admin_dm_conversation_id
          and auth.uid() in (c.participant_low, c.participant_high)
      )
    )
  );

drop policy if exists "message_reactions_select" on public.message_reactions;
create policy "message_reactions_select"
  on public.message_reactions for select to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and (
          (
            m.admin_dm_conversation_id is null
            and (m.client_id = auth.uid() or public.is_admin())
          )
          or (
            m.admin_dm_conversation_id is not null
            and public.is_admin()
            and exists (
              select 1 from public.admin_dm_conversations c
              where c.id = m.admin_dm_conversation_id
                and auth.uid() in (c.participant_low, c.participant_high)
            )
          )
        )
    )
  );

drop policy if exists "message_reactions_insert" on public.message_reactions;
create policy "message_reactions_insert"
  on public.message_reactions for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.messages m
      where m.id = message_id
        and m.deleted_at is null
        and (
          (
            m.admin_dm_conversation_id is null
            and (m.client_id = auth.uid() or public.is_admin())
          )
          or (
            m.admin_dm_conversation_id is not null
            and public.is_admin()
            and exists (
              select 1 from public.admin_dm_conversations c
              where c.id = m.admin_dm_conversation_id
                and auth.uid() in (c.participant_low, c.participant_high)
            )
          )
        )
    )
  );

drop policy if exists "message_reactions_delete" on public.message_reactions;
create policy "message_reactions_delete"
  on public.message_reactions for delete to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.messages m
      where m.id = message_id
        and (
          (
            m.admin_dm_conversation_id is null
            and (m.client_id = auth.uid() or public.is_admin())
          )
          or (
            m.admin_dm_conversation_id is not null
            and public.is_admin()
            and exists (
              select 1 from public.admin_dm_conversations c
              where c.id = m.admin_dm_conversation_id
                and auth.uid() in (c.participant_low, c.participant_high)
            )
          )
        )
    )
  );

drop policy if exists "message_attachments_insert" on storage.objects;

create or replace function public.safe_uuid(value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return value::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;
revoke all on function public.safe_uuid(text) from public, anon;
grant execute on function public.safe_uuid(text) to authenticated;

create policy "message_attachments_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'message-attachments'
    and (
      (
        (storage.foldername(name))[1] = 'admin-dm'
        and (storage.foldername(name))[3] = auth.uid()::text
        and public.is_admin()
        and exists (
          select 1 from public.admin_dm_conversations c
          where c.id = public.safe_uuid((storage.foldername(name))[2])
            and auth.uid() in (c.participant_low, c.participant_high)
        )
      )
      or (
        (storage.foldername(name))[1] = auth.uid()::text
        and coalesce(metadata->>'mimetype', '') !~* '^audio/'
      )
      or (
        public.is_admin()
        and (storage.foldername(name))[1] <> 'admin-dm'
      )
    )
  );

drop policy if exists "message_attachments_select" on storage.objects;
create policy "message_attachments_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'message-attachments'
    and (
      owner_id = auth.uid()::text
      or exists (
        select 1 from public.messages m
        where m.attachment_path = name
          and (
            (
              m.admin_dm_conversation_id is null
              and (m.client_id = auth.uid() or public.is_admin())
            )
            or (
              m.admin_dm_conversation_id is not null
              and public.is_admin()
              and exists (
                select 1 from public.admin_dm_conversations c
                where c.id = m.admin_dm_conversation_id
                  and auth.uid() in (c.participant_low, c.participant_high)
              )
            )
          )
      )
    )
  );

drop policy if exists "message_attachments_delete" on storage.objects;
create policy "message_attachments_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'message-attachments'
    and (
      owner_id = auth.uid()::text
      or exists (
        select 1 from public.messages m
        where m.attachment_path = name
          and m.admin_dm_conversation_id is not null
          and public.is_admin()
          and exists (
            select 1 from public.admin_dm_conversations c
            where c.id = m.admin_dm_conversation_id
              and auth.uid() in (c.participant_low, c.participant_high)
          )
      )
      or (
        public.is_admin()
        and exists (
          select 1 from public.messages m
          where m.attachment_path = name
            and m.admin_dm_conversation_id is null
        )
      )
    )
  );

create or replace function public.load_admin_message_inbox_v2()
returns table (
  thread_type text,
  thread_id uuid,
  client_id uuid,
  admin_dm_conversation_id uuid,
  participant_ids uuid[],
  last_message jsonb,
  unread bigint
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
  with mama_threads as (
    select
      'mama'::text as thread_type,
      owner.id as thread_id,
      owner.id as client_id,
      null::uuid as admin_dm_conversation_id,
      array[owner.id]::uuid[] as participant_ids,
      to_jsonb(latest) as last_message,
      (
        select count(*)::bigint from public.messages unread_row
        where unread_row.client_id = owner.id
          and unread_row.admin_dm_conversation_id is null
          and unread_row.sender_id = owner.id
          and unread_row.read_at is null
          and unread_row.deleted_at is null
      ) as unread,
      latest.created_at,
      latest.id as message_id
    from public.profiles owner
    cross join lateral (
      select m.*
      from public.messages m
      where m.client_id = owner.id
        and m.admin_dm_conversation_id is null
      order by m.created_at desc, m.id desc
      limit 1
    ) latest
    where owner.role <> 'admin'
  ), admin_threads as (
    select
      'admin'::text as thread_type,
      conversation.id as thread_id,
      conversation.participant_low as client_id,
      conversation.id as admin_dm_conversation_id,
      array[conversation.participant_low, conversation.participant_high]::uuid[]
        as participant_ids,
      to_jsonb(latest) as last_message,
      (
        select count(*)::bigint from public.messages unread_row
        where unread_row.admin_dm_conversation_id = conversation.id
          and unread_row.recipient_id = auth.uid()
          and unread_row.read_at is null
          and unread_row.deleted_at is null
      ) as unread,
      latest.created_at,
      latest.id as message_id
    from public.admin_dm_conversations conversation
    cross join lateral (
      select m.*
      from public.messages m
      where m.admin_dm_conversation_id = conversation.id
      order by m.created_at desc, m.id desc
      limit 1
    ) latest
    where public.is_admin()
      and auth.uid() in (conversation.participant_low, conversation.participant_high)
  ), all_threads as (
    select * from mama_threads
    union all
    select * from admin_threads
  )
  select
    item.thread_type,
    item.thread_id,
    item.client_id,
    item.admin_dm_conversation_id,
    item.participant_ids,
    item.last_message,
    item.unread
  from all_threads item
  order by item.created_at desc, item.message_id desc;
end;
$$;

revoke all on function public.load_admin_message_inbox_v2() from public, anon;
grant execute on function public.load_admin_message_inbox_v2() to authenticated;



