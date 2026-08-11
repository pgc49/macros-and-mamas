begin;

select plan(16);

select has_table('public', 'messaging_runtime_config', 'runtime config exists');
select has_table('public', 'messaging_runtime_audit', 'runtime audit exists');
select ok(
  not has_table_privilege('authenticated', 'public.messaging_runtime_config', 'SELECT'),
  'authenticated clients cannot read control table directly'
);
select ok(
  not has_function_privilege('anon', 'public.messaging_runtime_status()', 'EXECUTE'),
  'anonymous users cannot read runtime status'
);

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000031', 'runtime-mama@example.com');
insert into public.profiles (id, email, name, role, status)
values (
  '00000000-0000-0000-0000-000000000031',
  'runtime-mama@example.com',
  'Runtime Mama',
  'client',
  'active'
);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000031';

select is(
  (select mode from public.messaging_runtime_status()),
  'normal',
  'authenticated app reads safe runtime status'
);

select lives_ok(
  $$
    insert into public.messages (client_id, sender_id, body, kind)
    values (
      '00000000-0000-0000-0000-000000000031',
      '00000000-0000-0000-0000-000000000031',
      'existing message',
      'chat'
    )
  $$,
  'normal mode permits writes'
);

reset role;
set local role service_role;

select is(
  (
    select mode
    from public.update_messaging_runtime(
      '00000000-0000-0000-0000-000000000031',
      '10000000-0000-4000-8000-000000000031',
      (select updated_at from public.messaging_runtime_config where singleton),
      'read_only',
      null,
      null,
      'Maintenance test'
    )
  ),
  'read_only',
  'atomic runtime RPC changes mode'
);

select is(
  (select count(*)::integer from public.messaging_runtime_audit),
  1,
  'runtime change writes one audit record transactionally'
);

select throws_ok(
  $$
    select * from public.update_messaging_runtime(
      '00000000-0000-0000-0000-000000000031',
      '10000000-0000-4000-8000-000000000032',
      '2000-01-01T00:00:00Z',
      'normal',
      null,
      null,
      null
    )
  $$,
  '40001',
  'messaging runtime changed; refresh and retry',
  'stale admin control update is rejected'
);

reset role;
set local role authenticated;

select throws_ok(
  $$
    insert into public.messages (client_id, sender_id, body, kind)
    values (
      '00000000-0000-0000-0000-000000000031',
      '00000000-0000-0000-0000-000000000031',
      'blocked DM',
      'chat'
    )
  $$,
  'P0001',
  'messaging is temporarily read-only',
  'read-only mode blocks new messages'
);

select throws_ok(
  $$
    update public.messages
    set body = 'blocked edit'
    where body = 'existing message'
  $$,
  'P0001',
  'messaging is temporarily read-only',
  'read-only mode blocks edits'
);

select throws_ok(
  $$
    insert into public.message_reactions (message_id, user_id, emoji)
    select id, sender_id, '❤️'
    from public.messages
    where body = 'existing message'
  $$,
  'P0001',
  'messaging is temporarily read-only',
  'read-only mode blocks reactions'
);

reset role;
select throws_ok(
  $$
    insert into public.conversation_messages (conversation_id, body, kind)
    values (gen_random_uuid(), 'blocked channel', 'chat')
  $$,
  'P0001',
  'messaging is temporarily read-only',
  'read-only mode blocks channel messages'
);

set local role authenticated;
select is(
  public.messaging_attachments_enabled(),
  false,
  'read-only mode blocks attachment uploads'
);

reset role;
update public.messaging_runtime_config
set mode = 'normal', attachments_enabled = false, notifications_enabled = false
where singleton;

set local role service_role;
select is(
  (
    select count(*)::integer
    from public.claim_message_notification_job(
      'dm',
      (select id from public.messages where body = 'existing message')
    )
  ),
  0,
  'notification pause prevents job claims'
);

reset role;
update public.messaging_runtime_config set notifications_enabled = true where singleton;
set local role service_role;

select is(
  (
    select status
    from public.claim_message_notification_job(
      'dm',
      (select id from public.messages where body = 'existing message')
    )
  ),
  'processing',
  're-enabling notifications releases pending jobs'
);

reset role;
select * from finish();
rollback;

