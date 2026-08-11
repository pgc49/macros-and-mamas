begin;

select plan(15);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000021', 'rls-admin@example.com'),
  ('00000000-0000-0000-0000-000000000022', 'rls-mama@example.com'),
  ('00000000-0000-0000-0000-000000000023', 'rls-admin-two@example.com'),
  ('00000000-0000-0000-0000-000000000024', 'rls-admin-three@example.com');

insert into public.profiles (id, email, name, role, status)
values
  ('00000000-0000-0000-0000-000000000021', 'rls-admin@example.com', 'Admin', 'admin', 'active'),
  ('00000000-0000-0000-0000-000000000022', 'rls-mama@example.com', 'Mama', 'client', 'active'),
  ('00000000-0000-0000-0000-000000000023', 'rls-admin-two@example.com', 'Admin Two', 'admin', 'active'),
  ('00000000-0000-0000-0000-000000000024', 'rls-admin-three@example.com', 'Admin Three', 'admin', 'active');

insert into public.messages (id, client_id, sender_id, recipient_id, body, kind)
values
  (
    '10000000-0000-0000-0000-000000000021',
    '00000000-0000-0000-0000-000000000022',
    '00000000-0000-0000-0000-000000000021',
    null,
    'coach to mama',
    'chat'
  ),
  (
    '10000000-0000-0000-0000-000000000022',
    '00000000-0000-0000-0000-000000000022',
    '00000000-0000-0000-0000-000000000022',
    null,
    'mama to coach',
    'chat'
  ),
  (
    '10000000-0000-0000-0000-000000000023',
    '00000000-0000-0000-0000-000000000022',
    '00000000-0000-0000-0000-000000000021',
    null,
    'second coach to mama',
    'chat'
  ),
  (
    '10000000-0000-0000-0000-000000000024',
    '00000000-0000-0000-0000-000000000021',
    '00000000-0000-0000-0000-000000000023',
    '00000000-0000-0000-0000-000000000021',
    'admin two to admin one',
    'chat'
  ),
  (
    '10000000-0000-0000-0000-000000000025',
    '00000000-0000-0000-0000-000000000021',
    '00000000-0000-0000-0000-000000000021',
    '00000000-0000-0000-0000-000000000023',
    'admin owner to admin two',
    'chat'
  );

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000022';
set local request.jwt.claim.role = 'authenticated';

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

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000024';

select throws_ok(
  $$
    update public.messages
    set read_at = now()
    where id = '10000000-0000-0000-0000-000000000023'
  $$,
  'P0001',
  'only the recipient can mark message read',
  'unrelated admin cannot mark coach-to-mama message read'
);

select throws_ok(
  $$
    update public.messages
    set read_at = now()
    where id = '10000000-0000-0000-0000-000000000024'
  $$,
  'P0001',
  'only the recipient can mark message read',
  'nonrecipient admin cannot mark admin DM read'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000021';

select lives_ok(
  $$
    update public.messages
    set read_at = now()
    where id = '10000000-0000-0000-0000-000000000024'
  $$,
  'admin DM recipient can mark message read'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000024';

select throws_ok(
  $$
    update public.messages
    set read_at = now()
    where id = '10000000-0000-0000-0000-000000000025'
  $$,
  'P0001',
  'only the recipient can mark message read',
  'third admin cannot mark owner-sent admin DM read'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000023';

select lives_ok(
  $$
    update public.messages
    set read_at = now()
    where id = '10000000-0000-0000-0000-000000000025'
  $$,
  'owner-sent admin DM recipient can mark message read'
);

set local role service_role;
set local request.jwt.claim.role = 'service_role';

select lives_ok(
  $$
    update public.messages
    set notified_at = now()
    where id = '10000000-0000-0000-0000-000000000021'
  $$,
  'service role can update server-managed notification state'
);

select ok(
  (
    select notified_at is not null
    from public.messages
    where id = '10000000-0000-0000-0000-000000000021'
  ),
  'service-managed notification state persisted'
);

select throws_ok(
  $$
    update public.messages
    set read_at = null
    where id = '10000000-0000-0000-0000-000000000021'
  $$,
  'P0001',
  'read receipt is monotonic',
  'service role cannot reverse a read receipt'
);

reset role;
reset request.jwt.claim.role;

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

