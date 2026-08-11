begin;

select plan(7);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000021', 'rls-admin@example.com'),
  ('00000000-0000-0000-0000-000000000022', 'rls-mama@example.com');

insert into public.profiles (id, email, name, role, status)
values
  ('00000000-0000-0000-0000-000000000021', 'rls-admin@example.com', 'Admin', 'admin', 'active'),
  ('00000000-0000-0000-0000-000000000022', 'rls-mama@example.com', 'Mama', 'client', 'active');

insert into public.messages (id, client_id, sender_id, body, kind)
values
  (
    '10000000-0000-0000-0000-000000000021',
    '00000000-0000-0000-0000-000000000022',
    '00000000-0000-0000-0000-000000000021',
    'coach to mama',
    'chat'
  ),
  (
    '10000000-0000-0000-0000-000000000022',
    '00000000-0000-0000-0000-000000000022',
    '00000000-0000-0000-0000-000000000022',
    'mama to coach',
    'chat'
  );

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000022';

select throws_ok(
  $$
    update public.messages
    set read_at = now()
    where id = '10000000-0000-0000-0000-000000000022'
  $$,
  'P0001',
  'sender cannot mark own message read',
  'sender cannot forge own delivery receipt'
);

select lives_ok(
  $$
    update public.messages
    set read_at = now()
    where id = '10000000-0000-0000-0000-000000000021'
  $$,
  'recipient can mark inbound message read'
);

select ok(
  (
    select read_at is not null
    from public.messages
    where id = '10000000-0000-0000-0000-000000000021'
  ),
  'recipient read receipt persisted'
);

select throws_ok(
  $$
    update public.messages
    set read_at = null
    where id = '10000000-0000-0000-0000-000000000021'
  $$,
  'P0001',
  'read receipt is monotonic',
  'read receipt cannot be reset'
);

select throws_ok(
  $$
    update public.messages
    set notified_at = now()
    where id = '10000000-0000-0000-0000-000000000021'
  $$,
  'P0001',
  'notification state is server-managed',
  'client cannot suppress notification processing'
);

select throws_ok(
  $$
    update public.messages
    set body = 'forged edit'
    where id = '10000000-0000-0000-0000-000000000021'
  $$,
  'P0001',
  'only the sender can edit or delete a message',
  'mama cannot edit coach message'
);

reset role;

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'message_attachments_delete'
      and cmd = 'DELETE'
      and qual ilike '%owner_id%'
      and qual not ilike '%foldername%'
  ),
  'attachment delete policy is uploader-owned, not thread-folder-owned'
);

select * from finish();

rollback;

