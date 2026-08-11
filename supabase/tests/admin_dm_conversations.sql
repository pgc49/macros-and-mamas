begin;

select plan(24);

select is(
  (select count(*)::integer from public.admin_dm_conversations),
  1,
  'two legacy owner buckets merge into one pair conversation'
);
select is(
  (select count(*)::integer from public.messages where admin_dm_conversation_id is not null),
  51,
  'all 51 legacy admin rows are linked'
);
select is(
  (select count(*)::integer from public.messages where legacy_admin_attachment_path),
  3,
  'exactly three legacy attachment rows are stamped'
);
select is(
  (
    select count(*)::integer from public.messages
    where client_id = '00000000-0000-0000-0000-000000000051'
  ),
  5,
  'legacy owner A client IDs remain unchanged'
);
select is(
  (
    select count(*)::integer from public.messages
    where client_id = '00000000-0000-0000-0000-000000000052'
  ),
  46,
  'legacy owner B client IDs remain unchanged'
);
select is(
  (
    select count(distinct attachment_path)::integer from public.messages
    where attachment_path is not null
  ),
  3,
  'all legacy attachment paths remain present'
);
select ok(
  not exists (
    select 1 from public.messages
    where admin_dm_conversation_id is not null
      and (recipient_id is null or recipient_id = sender_id)
  ),
  'every linked message has the other participant as recipient'
);
select ok(
  exists (
    select 1
    from public.messages child
    join public.messages parent on parent.id = child.reply_to_id
    where child.body = 'legacy-b-3'
      and child.admin_dm_conversation_id = parent.admin_dm_conversation_id
  ),
  'legacy reply remains linked inside conversation'
);
select is(
  (select count(*)::integer from public.message_reactions),
  1,
  'legacy reactions remain linked'
);

select throws_ok(
  $$
    insert into public.profiles (id, email, name, role, status)
    values (
      '00000000-0000-0000-0000-000000000053',
      'admin-c@example.com',
      'Admin C',
      'admin',
      'active'
    )
  $$,
  'P0001',
  'admin provisioning frozen during DM migration',
  'third admin provisioning is frozen during compatibility'
);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000051';

select lives_ok(
  $$
    insert into public.messages (
      client_id, sender_id, body, kind, attachment_path,
      attachment_name, attachment_mime, attachment_bytes
    ) values (
      '00000000-0000-0000-0000-000000000051',
      '00000000-0000-0000-0000-000000000051',
      'compatibility write',
      'chat',
      '00000000-0000-0000-0000-000000000051/compat.pdf',
      'compat.pdf',
      'application/pdf',
      10
    )
  $$,
  'old two-admin client write is linked during compatibility'
);
select ok(
  (
    select admin_dm_conversation_id is not null
      and recipient_id = '00000000-0000-0000-0000-000000000052'
      and legacy_admin_attachment_path
    from public.messages where body = 'compatibility write'
  ),
  'compatibility trigger assigns pair, recipient, and legacy stamp'
);

reset role;
update public.admin_dm_migration_state
set compatibility_enabled = false, admin_provisioning_frozen = false
where singleton;
insert into public.profiles (id, email, name, role, status)
values (
  '00000000-0000-0000-0000-000000000053',
  'admin-c@example.com',
  'Admin C',
  'admin',
  'active'
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000051';

select throws_ok(
  $$
    insert into public.messages (client_id, sender_id, body, kind)
    values (
      '00000000-0000-0000-0000-000000000051',
      '00000000-0000-0000-0000-000000000051',
      'stale unlinked write',
      'chat'
    )
  $$,
  'P0001',
  'admin DM conversation required',
  'conversation-unaware admin write is rejected post-window'
);

select isnt(
  (select id from public.ensure_admin_dm_conversation(
    '00000000-0000-0000-0000-000000000052'
  )),
  (select id from public.ensure_admin_dm_conversation(
    '00000000-0000-0000-0000-000000000053'
  )),
  'A-B and A-C have distinct conversation IDs'
);

select is(
  (select count(*)::integer from public.admin_dm_conversations),
  2,
  'third admin creates exactly one additional pair'
);

select lives_ok(
  $$
    insert into public.messages (
      client_id, sender_id, recipient_id, admin_dm_conversation_id,
      body, kind, attachment_path
    )
    select
      conversation.participant_low,
      '00000000-0000-0000-0000-000000000051',
      '00000000-0000-0000-0000-000000000053',
      conversation.id,
      'A to C private',
      'chat',
      'admin-dm/' || conversation.id || '/00000000-0000-0000-0000-000000000051/file.pdf'
    from public.admin_dm_conversations conversation
    where conversation.participant_high = '00000000-0000-0000-0000-000000000053'
  $$,
  'new linked admin message uses pair conversation path'
);

select throws_ok(
  $$
    insert into public.messages (
      client_id, sender_id, recipient_id, admin_dm_conversation_id,
      body, kind, attachment_path
    )
    select
      conversation.participant_low,
      '00000000-0000-0000-0000-000000000051',
      '00000000-0000-0000-0000-000000000053',
      conversation.id,
      'invalid linked legacy path',
      'chat',
      conversation.participant_low || '/forged.pdf'
    from public.admin_dm_conversations conversation
    where conversation.participant_high = '00000000-0000-0000-0000-000000000053'
  $$,
  '23514',
  null,
  'ordinary linked write cannot use legacy path'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000052';
select is(
  (
    select count(*)::integer from public.messages
    where body = 'A to C private'
  ),
  0,
  'nonparticipant admin cannot read A-C message'
);
select is(
  (
    select count(*)::integer from public.message_reactions reaction
    join public.messages message on message.id = reaction.message_id
    where message.body = 'A to C private'
  ),
  0,
  'nonparticipant admin cannot read A-C reactions'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000053';
select lives_ok(
  $$
    update public.messages
    set read_at = now()
    where body = 'A to C private'
  $$,
  'explicit admin recipient can mark message read'
);
select ok(
  (select read_at is not null from public.messages where body = 'A to C private'),
  'admin receipt persisted'
);

reset role;
update public.profiles set role = 'client'
where id = '00000000-0000-0000-0000-000000000053';
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000053';
select is(
  (
    select count(*)::integer from public.messages
    where body = 'A to C private'
  ),
  0,
  'demoted participant loses historical message access'
);
select throws_ok(
  $$
    select * from public.ensure_admin_dm_conversation(
      '00000000-0000-0000-0000-000000000051'
    )
  $$,
  'P0001',
  'valid admin peer required',
  'demoted participant cannot ensure admin conversation'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000051';
select is(
  (
    select count(*)::integer
    from public.load_admin_message_inbox_v2()
  ),
  2,
  'inbox v2 returns one row per pair for current admin A'
);

select * from finish();
rollback;

