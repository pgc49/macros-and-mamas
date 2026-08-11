begin;

select plan(10);

select has_table(
  'public',
  'messaging_runtime_config',
  'messaging runtime config exists'
);

select ok(
  not has_table_privilege('authenticated', 'public.messaging_runtime_config', 'SELECT'),
  'authenticated clients cannot read control table directly'
);

select ok(
  not has_function_privilege('anon', 'public.messaging_runtime_status()', 'EXECUTE'),
  'anonymous users cannot read messaging runtime'
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
  'authenticated app can read safe runtime status'
);

reset role;
update public.messaging_runtime_config set mode = 'read_only' where singleton;
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
  'read-only mode blocks DM writes'
);

reset role;
select throws_ok(
  $$
    insert into public.conversation_messages (conversation_id, body, kind)
    values (gen_random_uuid(), 'blocked channel', 'chat')
  $$,
  'P0001',
  'messaging is temporarily read-only',
  'read-only mode blocks channel writes'
);

update public.messaging_runtime_config
set mode = 'normal', attachments_enabled = false
where singleton;

set local role authenticated;
select lives_ok(
  $$
    insert into public.messages (client_id, sender_id, body, kind)
    values (
      '00000000-0000-0000-0000-000000000031',
      '00000000-0000-0000-0000-000000000031',
      'allowed DM',
      'chat'
    )
  $$,
  'normal mode permits DM writes'
);

select is(
  public.messaging_attachments_enabled(),
  false,
  'attachment switch is exposed safely to storage policy'
);

reset role;
update public.messaging_runtime_config
set notifications_enabled = false
where singleton;

set local role service_role;
select is(
  (
    select count(*)::integer
    from public.claim_message_notification_job(
      'dm',
      (
        select id from public.messages
        where body = 'allowed DM'
        limit 1
      )
    )
  ),
  0,
  'notification pause prevents job claims'
);

reset role;
update public.messaging_runtime_config
set notifications_enabled = true
where singleton;
set local role service_role;

select is(
  (
    select status
    from public.claim_message_notification_job(
      'dm',
      (
        select id from public.messages
        where body = 'allowed DM'
        limit 1
      )
    )
  ),
  'processing',
  're-enabling notifications releases pending jobs'
);

reset role;
select * from finish();
rollback;

