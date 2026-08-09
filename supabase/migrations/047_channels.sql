-- Stage 3: cohort + alumni group chat (separate from 1:1 messages).
-- C1 "Founding Members" seeded + backfilled. C2 + Alumni shells created empty.

-- ---------------------------------------------------------------------------
-- profiles.tier (+ lock with ambassador / cohort_label)
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.membership_tier as enum (
    'none',
    'active_pod',
    'alumni_49',
    'alumni_19'
  );
exception
  when duplicate_object then null;
end $$;

alter table public.profiles
  add column if not exists tier public.membership_tier not null default 'none';

comment on column public.profiles.tier is
  'none | active_pod | alumni_49 | alumni_19. Stage 3 stamps active_pod; stage 4 owns alumni.';

alter table public.profiles
  add column if not exists cohort_label text null;

alter table public.profiles
  add column if not exists ambassador boolean not null default false;

create or replace function public.protect_payment_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  new.paid := old.paid;
  new.refunded := old.refunded;
  new.stripe_customer_id := old.stripe_customer_id;
  new.stripe_payment_intent := old.stripe_payment_intent;
  new.paid_at := old.paid_at;
  new.lab_review_purchased := old.lab_review_purchased;
  new.lab_review_purchased_at := old.lab_review_purchased_at;
  new.role := old.role;
  new.status := old.status;
  new.week := old.week;
  new.created_at := old.created_at;
  new.ambassador := old.ambassador;
  new.cohort_label := old.cohort_label;
  new.tier := old.tier;
  return new;
end;
$$;

create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  if TG_OP = 'INSERT' then
    new.role := 'client';
    new.paid := false;
    new.refunded := false;
    new.stripe_customer_id := null;
    new.stripe_payment_intent := null;
    new.paid_at := null;
    new.lab_review_purchased := false;
    new.lab_review_purchased_at := null;
    new.ambassador := false;
    new.cohort_label := null;
    new.tier := 'none';
    new.created_at := now();
    if new.status = 'active' then
      new.status := 'pending';
    end if;
    return new;
  end if;

  new.paid := old.paid;
  new.refunded := old.refunded;
  new.stripe_customer_id := old.stripe_customer_id;
  new.stripe_payment_intent := old.stripe_payment_intent;
  new.paid_at := old.paid_at;
  new.lab_review_purchased := old.lab_review_purchased;
  new.lab_review_purchased_at := old.lab_review_purchased_at;
  new.role := old.role;
  new.status := old.status;
  new.week := old.week;
  new.created_at := old.created_at;
  new.ambassador := old.ambassador;
  new.cohort_label := old.cohort_label;
  new.tier := old.tier;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Conversations
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.conversation_type as enum ('cohort', 'alumni');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.channel_notify_level as enum ('all', 'highlights', 'mute');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.channel_message_kind as enum ('chat', 'system', 'voice');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  type public.conversation_type not null,
  cohort_label text null,
  label text not null,
  read_only boolean not null default false,
  guidelines text null,
  created_at timestamptz not null default now(),
  constraint conversations_cohort_label_check check (
    (type = 'cohort' and cohort_label is not null)
    or (type = 'alumni' and cohort_label is null)
  )
);

create unique index if not exists conversations_cohort_label_uidx
  on public.conversations (cohort_label)
  where type = 'cohort' and cohort_label is not null;

create unique index if not exists conversations_one_alumni_uidx
  on public.conversations ((type))
  where type = 'alumni';

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  removed_at timestamptz null,
  notify_level public.channel_notify_level not null default 'highlights',
  last_read_at timestamptz null,
  primary key (conversation_id, user_id)
);

create index if not exists conversation_members_user_active_idx
  on public.conversation_members (user_id)
  where removed_at is null;

create index if not exists conversation_members_conv_active_idx
  on public.conversation_members (conversation_id)
  where removed_at is null;

create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid null references public.profiles (id) on delete set null,
  body text not null default '',
  kind public.channel_message_kind not null default 'chat',
  reply_to_id uuid null references public.conversation_messages (id) on delete set null,
  attachment_path text null,
  attachment_name text null,
  attachment_mime text null,
  attachment_bytes integer null,
  created_at timestamptz not null default now(),
  edited_at timestamptz null,
  deleted_at timestamptz null,
  notified_at timestamptz null,
  constraint conversation_messages_body_len check (char_length(trim(body)) <= 2000),
  constraint conversation_messages_has_content check (
    char_length(trim(body)) >= 1
    or (attachment_path is not null and char_length(trim(attachment_path)) between 1 and 500)
    or kind = 'system'
  )
);

create index if not exists conversation_messages_conv_created_idx
  on public.conversation_messages (conversation_id, created_at desc);

create index if not exists conversation_messages_reply_to_idx
  on public.conversation_messages (reply_to_id)
  where reply_to_id is not null;

create table if not exists public.channel_prompts (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 500),
  cadence text not null default 'weekly',
  active boolean not null default true,
  last_posted_at timestamptz null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Membership helper (SECURITY DEFINER for RLS)
-- ---------------------------------------------------------------------------
create or replace function public.is_active_conversation_member(conv_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_members m
    where m.conversation_id = conv_id
      and m.user_id = auth.uid()
      and m.removed_at is null
  ) or public.is_admin();
$$;

revoke all on function public.is_active_conversation_member(uuid) from public;
grant execute on function public.is_active_conversation_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.channel_prompts enable row level security;

alter table public.conversations force row level security;
alter table public.conversation_members force row level security;
alter table public.conversation_messages force row level security;
alter table public.channel_prompts force row level security;

revoke all on table public.conversations from anon, authenticated;
revoke all on table public.conversation_members from anon, authenticated;
revoke all on table public.conversation_messages from anon, authenticated;
revoke all on table public.channel_prompts from anon, authenticated;

grant select on table public.conversations to authenticated;
grant select, update on table public.conversation_members to authenticated;
grant select, insert, update on table public.conversation_messages to authenticated;
-- channel_prompts: service role / admin via service only (no client grant beyond select for admin UI later)
grant select on table public.channel_prompts to authenticated;

drop policy if exists "conversations_select_member_or_admin" on public.conversations;
create policy "conversations_select_member_or_admin"
  on public.conversations for select to authenticated
  using (public.is_active_conversation_member(id));

drop policy if exists "conversation_members_select_own_or_admin" on public.conversation_members;
create policy "conversation_members_select_own_or_admin"
  on public.conversation_members for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Members may update only their own notify_level / last_read_at (not removed_at).
drop policy if exists "conversation_members_update_own" on public.conversation_members;
create policy "conversation_members_update_own"
  on public.conversation_members for update to authenticated
  using (user_id = auth.uid() and removed_at is null)
  with check (user_id = auth.uid() and removed_at is null);

drop policy if exists "conversation_messages_select_member" on public.conversation_messages;
create policy "conversation_messages_select_member"
  on public.conversation_messages for select to authenticated
  using (public.is_active_conversation_member(conversation_id));

drop policy if exists "conversation_messages_insert_member" on public.conversation_messages;
create policy "conversation_messages_insert_member"
  on public.conversation_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_active_conversation_member(conversation_id)
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and c.read_only = false
    )
    and (
      public.is_admin()
      or kind = 'chat'
    )
    and (
      public.is_admin()
      or attachment_mime is null
      or attachment_mime !~* '^audio/'
    )
  );

drop policy if exists "conversation_messages_update_member" on public.conversation_messages;
create policy "conversation_messages_update_member"
  on public.conversation_messages for update to authenticated
  using (
    public.is_admin()
    or (
      sender_id = auth.uid()
      and public.is_active_conversation_member(conversation_id)
    )
  )
  with check (
    public.is_admin()
    or (
      sender_id = auth.uid()
      and public.is_active_conversation_member(conversation_id)
    )
  );

drop policy if exists "channel_prompts_select_admin" on public.channel_prompts;
create policy "channel_prompts_select_admin"
  on public.channel_prompts for select to authenticated
  using (public.is_admin());

-- Soft-delete scrub + identity freeze for channel messages
create or replace function public.protect_conversation_message_edits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  new.conversation_id := old.conversation_id;
  new.sender_id := old.sender_id;
  new.kind := old.kind;
  new.created_at := old.created_at;
  new.reply_to_id := old.reply_to_id;
  new.notified_at := coalesce(old.notified_at, new.notified_at);

  if new.deleted_at is not null and old.deleted_at is null then
    if not public.is_admin() and new.sender_id is distinct from auth.uid() then
      raise exception 'only sender or admin may delete';
    end if;
    new.body := '';
    new.attachment_path := null;
    new.attachment_name := null;
    new.attachment_mime := null;
    new.attachment_bytes := null;
    return new;
  end if;

  if new.deleted_at is not null then
    return old;
  end if;

  -- Edit body: sender only (admin may also edit)
  if new.body is distinct from old.body then
    if not public.is_admin() and old.sender_id is distinct from auth.uid() then
      raise exception 'only sender or admin may edit';
    end if;
    new.edited_at := now();
  end if;

  -- Members cannot change notify metadata via message row
  if not public.is_admin() then
    new.attachment_path := old.attachment_path;
    new.attachment_name := old.attachment_name;
    new.attachment_mime := old.attachment_mime;
    new.attachment_bytes := old.attachment_bytes;
  end if;

  return new;
end;
$$;

drop trigger if exists conversation_messages_protect_edits on public.conversation_messages;
create trigger conversation_messages_protect_edits
  before update on public.conversation_messages
  for each row execute function public.protect_conversation_message_edits();

-- Block member from clearing removed_at / forging membership fields via UPDATE
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
  -- allow notify_level + last_read_at only
  return new;
end;
$$;

drop trigger if exists conversation_members_protect on public.conversation_members;
create trigger conversation_members_protect
  before update on public.conversation_members
  for each row execute function public.protect_conversation_member_updates();

-- ---------------------------------------------------------------------------
-- Storage: channel-attachments
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'channel-attachments',
  'channel-attachments',
  false,
  10485760,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif',
    'application/pdf',
    'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/x-m4a', 'audio/aac'
  ]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "channel_attachments_select" on storage.objects;
create policy "channel_attachments_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'channel-attachments'
    and (
      public.is_admin()
      or public.is_active_conversation_member(((storage.foldername(name))[1])::uuid)
    )
  );

drop policy if exists "channel_attachments_insert" on storage.objects;
create policy "channel_attachments_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'channel-attachments'
    and public.is_active_conversation_member(((storage.foldername(name))[1])::uuid)
    and (
      public.is_admin()
      or coalesce(metadata->>'mimetype', '') !~* '^audio/'
    )
  );

drop policy if exists "channel_attachments_delete" on storage.objects;
create policy "channel_attachments_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'channel-attachments'
    and (
      public.is_admin()
      or public.is_active_conversation_member(((storage.foldername(name))[1])::uuid)
    )
  );

-- Realtime
do $$ begin
  alter publication supabase_realtime add table public.conversation_messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Seed conversations
-- ---------------------------------------------------------------------------
insert into public.conversations (type, cohort_label, label, read_only, guidelines)
select 'cohort', '2026-07', 'Founding Members', false,
  E'Group guidelines\n• Kindness first — we''re all figuring this out.\n• No medical advice — share experience, not prescriptions.\n• No promo or selling.'
where not exists (
  select 1 from public.conversations where type = 'cohort' and cohort_label = '2026-07'
);

insert into public.conversations (type, cohort_label, label, read_only, guidelines)
select 'cohort', '2026-08', 'August Group', false,
  E'Group guidelines\n• Kindness first — we''re all figuring this out.\n• No medical advice — share experience, not prescriptions.\n• No promo or selling.'
where not exists (
  select 1 from public.conversations where type = 'cohort' and cohort_label = '2026-08'
);

insert into public.conversations (type, cohort_label, label, read_only, guidelines)
select 'alumni', null, 'Alumni', false,
  E'Group guidelines\n• Kindness first — we''re all figuring this out.\n• No medical advice — share experience, not prescriptions.\n• No promo or selling.'
where not exists (
  select 1 from public.conversations where type = 'alumni'
);

-- Stamp cohort_label/tier in 048 (triggers block plain UPDATEs under postgres role).
-- Enroll Founding Members (paid cluster week of 2026-07-20)
insert into public.conversation_members (conversation_id, user_id, notify_level)
select c.id, p.id, 'highlights'
from public.conversations c
join public.profiles p on true
where c.type = 'cohort'
  and c.cohort_label = '2026-07'
  and p.role = 'client'
  and p.paid = true
  and coalesce(p.refunded, false) = false
  and p.paid_at is not null
  and p.paid_at >= '2026-07-20T00:00:00Z'
  and p.paid_at < '2026-07-27T00:00:00Z'
on conflict (conversation_id, user_id) do nothing;

-- Callie + Patrick in every channel (moderation / coaching).
-- Default highlights (same as mamas); admins can switch to All in the UI.
insert into public.conversation_members (conversation_id, user_id, notify_level)
select c.id, a.id, 'highlights'
from public.conversations c
cross join public.profiles a
where a.role = 'admin'
on conflict (conversation_id, user_id) do nothing;

-- Pinned-style guidelines as first system message in Founding Members
insert into public.conversation_messages (conversation_id, sender_id, body, kind)
select c.id, null, c.guidelines, 'system'
from public.conversations c
where c.cohort_label = '2026-07'
  and not exists (
    select 1 from public.conversation_messages m
    where m.conversation_id = c.id and m.kind = 'system'
  );
