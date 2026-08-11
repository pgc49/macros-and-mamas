-- Tighten DM mutation and attachment ownership boundaries.

alter table public.messages
  add column if not exists recipient_id uuid null references public.profiles(id) on delete set null;

create index if not exists messages_recipient_created_idx
  on public.messages (recipient_id, created_at desc)
  where recipient_id is not null;

-- Admin → mama has one explicit recipient.
update public.messages m
set recipient_id = m.client_id
where m.recipient_id is null
  and m.sender_id <> m.client_id
  and not exists (
    select 1 from public.profiles p
    where p.id = m.client_id and p.role = 'admin'
  );

-- Existing admin↔admin threads currently have two participants. Infer the
-- other participant once, then require all future writes to be explicit.
update public.messages m
set recipient_id = (
  select candidate.sender_id
  from public.messages candidate
  join public.profiles sender_profile on sender_profile.id = candidate.sender_id
  where candidate.client_id = m.client_id
    and candidate.sender_id <> m.sender_id
    and sender_profile.role = 'admin'
  order by candidate.created_at desc, candidate.id desc
  limit 1
)
where m.recipient_id is null
  and exists (
    select 1 from public.profiles p
    where p.id = m.client_id and p.role = 'admin'
  );

create or replace function private.set_dm_recipient()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  client_is_admin boolean;
  recipient_is_admin boolean;
begin
  select p.role = 'admin'
  into client_is_admin
  from public.profiles p
  where p.id = new.client_id;

  if coalesce(client_is_admin, false) then
    select p.role = 'admin'
    into recipient_is_admin
    from public.profiles p
    where p.id = new.recipient_id;

    if new.recipient_id is null
       or new.recipient_id = new.sender_id
       or not coalesce(recipient_is_admin, false)
       or new.client_id::text <> least(new.sender_id::text, new.recipient_id::text)
    then
      raise exception 'admin DM requires explicit canonical recipient';
    end if;
  elsif new.sender_id <> new.client_id then
    new.recipient_id := new.client_id;
  else
    -- Mama → coach remains a shared coach inbox acknowledgement.
    new.recipient_id := null;
  end if;

  return new;
end;
$$;

drop trigger if exists messages_set_recipient on public.messages;
create trigger messages_set_recipient
before insert on public.messages
for each row execute function private.set_dm_recipient();

revoke all on function private.set_dm_recipient() from public;

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
    select
      m.id,
      m.client_id,
      m.sender_id,
      m.recipient_id,
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
        (
          exists (
            select 1
            from public.profiles client
            where client.id = m.client_id and client.role = 'admin'
          )
          and m.recipient_id = auth.uid()
        )
        or (
          not exists (
            select 1
            from public.profiles client
            where client.id = m.client_id and client.role = 'admin'
          )
          and not exists (
            select 1
            from public.profiles sender
            where sender.id = m.sender_id and sender.role = 'admin'
          )
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
      select m.recipient_id
      from public.messages m
      where m.client_id = t.client_id
      union all
      select t.client_id
    ) ids
  ) participants on true
  order by latest_message.created_at desc, latest_message.id desc;
end;
$$;

revoke all on function public.load_admin_message_inbox() from public, anon;
grant execute on function public.load_admin_message_inbox() to authenticated;

create or replace function public.protect_message_edits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  client_is_admin boolean;
begin
  if NEW.sender_id is distinct from OLD.sender_id
     or NEW.client_id is distinct from OLD.client_id
     or NEW.created_at is distinct from OLD.created_at
     or NEW.reply_to_id is distinct from OLD.reply_to_id
     or NEW.recipient_id is distinct from OLD.recipient_id
  then
    raise exception 'message identity is immutable';
  end if;

  if auth.role() is distinct from 'service_role'
     and NEW.notified_at is distinct from OLD.notified_at
  then
    raise exception 'notification state is server-managed';
  end if;

  if NEW.read_at is distinct from OLD.read_at then
    if NEW.read_at is null or OLD.read_at is not null then
      raise exception 'read receipt is monotonic';
    end if;
    if auth.role() is distinct from 'service_role' then
      if auth.uid() = OLD.sender_id then
        raise exception 'sender cannot mark own message read';
      end if;

      select exists (
        select 1
        from public.profiles p
        where p.id = OLD.client_id
          and p.role = 'admin'
      ) into client_is_admin;

      if client_is_admin then
        if OLD.recipient_id is null or auth.uid() <> OLD.recipient_id then
          raise exception 'only the recipient can mark message read';
        end if;
      elsif OLD.sender_id = OLD.client_id then
        -- Mama → coach: an admin recipient may acknowledge.
        if not public.is_admin() then
          raise exception 'only the recipient can mark message read';
        end if;
      elsif auth.uid() <> OLD.client_id then
        -- Coach → mama: only that mama may acknowledge.
        raise exception 'only the recipient can mark message read';
      end if;
    end if;
  end if;

  -- Soft-delete: scrub content so "Message deleted" is real privacy.
  if NEW.deleted_at is not null and OLD.deleted_at is null then
    NEW.body := '';
    NEW.attachment_path := null;
    NEW.attachment_name := null;
    NEW.attachment_mime := null;
    NEW.attachment_bytes := null;
    NEW.edited_at := OLD.edited_at;
  elsif (
    NEW.attachment_path is distinct from OLD.attachment_path
    or NEW.attachment_name is distinct from OLD.attachment_name
    or NEW.attachment_mime is distinct from OLD.attachment_mime
    or NEW.attachment_bytes is distinct from OLD.attachment_bytes
  ) then
    raise exception 'message identity and attachments are immutable';
  end if;

  if (NEW.body is distinct from OLD.body
      or NEW.edited_at is distinct from OLD.edited_at
      or NEW.deleted_at is distinct from OLD.deleted_at)
     and auth.uid() is distinct from OLD.sender_id
     and auth.role() is distinct from 'service_role'
  then
    raise exception 'only the sender can edit or delete a message';
  end if;

  if NEW.deleted_at is null
     and char_length(trim(coalesce(NEW.body, ''))) = 0
     and NEW.attachment_path is null
  then
    raise exception 'message cannot be empty';
  end if;

  if char_length(trim(coalesce(NEW.body, ''))) > 2000 then
    raise exception 'message too long';
  end if;

  if NEW.kind is distinct from OLD.kind then
    raise exception 'message kind is immutable';
  end if;

  return NEW;
end;
$$;

revoke all on function public.protect_message_edits() from public, anon, authenticated;

drop trigger if exists messages_protect_edits on public.messages;
create trigger messages_protect_edits
  before update on public.messages
  for each row execute function public.protect_message_edits();

-- A mama can read every attachment in her own thread, but can only delete an
-- object she uploaded. Admins retain moderation/cleanup access.
drop policy if exists "message_attachments_delete" on storage.objects;
create policy "message_attachments_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'message-attachments'
    and (
      public.is_admin()
      or owner_id = auth.uid()::text
    )
  );

