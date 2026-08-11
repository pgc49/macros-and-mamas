begin;

select plan(9);

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

insert into storage.buckets (id, name, public)
values ('message-attachments', 'message-attachments', false)
on conflict (id) do nothing;

insert into storage.objects (id, bucket_id, name, owner_id)
values
  (
    '20000000-0000-4000-8000-000000000021',
    'message-attachments',
    '00000000-0000-0000-0000-000000000022/admin-file.pdf',
    '00000000-0000-0000-0000-000000000021'
  ),
  (
    '20000000-0000-4000-8000-000000000022',
    'message-attachments',
    '00000000-0000-0000-0000-000000000022/mama-file.pdf',
    '00000000-0000-0000-0000-000000000022'
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

select results_eq(
  $$
    delete from storage.objects
    where id = '20000000-0000-4000-8000-000000000021'
    returning 1
  $$,
  $$ select 1 where false $$,
  'mama cannot delete admin attachment in her thread folder'
);

select results_eq(
  $$
    delete from storage.objects
    where id = '20000000-0000-4000-8000-000000000022'
    returning 1
  $$,
  $$ values (1) $$,
  'mama can delete her own uploaded attachment'
);

reset role;

select is(
  (
    select count(*)::integer
    from storage.objects
    where id = '20000000-0000-4000-8000-000000000021'
  ),
  1,
  'admin-owned attachment remains after denied delete'
);

select * from finish();

rollback;

