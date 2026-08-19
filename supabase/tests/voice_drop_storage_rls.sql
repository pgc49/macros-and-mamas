begin;

select plan(17);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'voice_drops_storage_select'
      and 'authenticated' = any (roles)
      and qual ilike '%voice_drops%'
      and qual ilike '%audio_path%'
  ),
  'storage SELECT is tied to a visible voice_drops.audio_path, not the whole bucket'
);

select has_index(
  'public',
  'voice_drops',
  'voice_drops_audio_path_idx',
  'audio_path lookup used by storage RLS is indexed'
);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000021', 'callie-voice@example.com'),
  ('00000000-0000-0000-0000-000000000022', 'founding-voice@example.com'),
  ('00000000-0000-0000-0000-000000000023', 'c2-voice@example.com'),
  ('00000000-0000-0000-0000-000000000024', 'pending-voice@example.com'),
  ('00000000-0000-0000-0000-000000000025', 'refunded-voice@example.com');

insert into public.profiles (id, email, name, role, status, refunded, cohort_label)
values
  ('00000000-0000-0000-0000-000000000021', 'callie-voice@example.com', 'Callie', 'admin', 'active', false, null),
  ('00000000-0000-0000-0000-000000000022', 'founding-voice@example.com', 'Founding', 'client', 'active', false, '2026-07'),
  ('00000000-0000-0000-0000-000000000023', 'c2-voice@example.com', 'C2', 'client', 'active', false, '2026-08'),
  ('00000000-0000-0000-0000-000000000024', 'pending-voice@example.com', 'Pending', 'client', 'pending', false, '2026-07'),
  ('00000000-0000-0000-0000-000000000025', 'refunded-voice@example.com', 'Refunded', 'client', 'active', true, '2026-07');

insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
values
  ('voice-drops', 'founding-live/monday-voice.webm', '00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000021', '{"mimetype":"audio/webm"}'::jsonb),
  ('voice-drops', 'c2-live/monday-voice.webm', '00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000021', '{"mimetype":"audio/webm"}'::jsonb),
  ('voice-drops', 'all-mamas-live/monday-voice.webm', '00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000021', '{"mimetype":"audio/webm"}'::jsonb),
  ('voice-drops', 'admins-live/monday-voice.webm', '00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000021', '{"mimetype":"audio/webm"}'::jsonb),
  ('voice-drops', 'founding-superseded/monday-voice.webm', '00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000021', '{"mimetype":"audio/webm"}'::jsonb),
  ('voice-drops', 'founding-expired/monday-voice.webm', '00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000021', '{"mimetype":"audio/webm"}'::jsonb),
  ('voice-drops', 'orphan-upload/monday-voice.webm', '00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000021', '{"mimetype":"audio/webm"}'::jsonb);

insert into public.voice_drops (
  created_by, caption, audio_path, audio_mime, audience, cohort_label, status, published_at, expires_at
)
values
  (
    '00000000-0000-0000-0000-000000000021',
    'Founding Monday',
    'founding-live/monday-voice.webm',
    'audio/webm',
    'active',
    '2026-07',
    'published',
    now(),
    now() + interval '7 days'
  ),
  (
    '00000000-0000-0000-0000-000000000021',
    'C2 Monday',
    'c2-live/monday-voice.webm',
    'audio/webm',
    'active',
    '2026-08',
    'published',
    now(),
    now() + interval '7 days'
  ),
  (
    '00000000-0000-0000-0000-000000000021',
    'All mamas',
    'all-mamas-live/monday-voice.webm',
    'audio/webm',
    'all_mamas',
    null,
    'published',
    now(),
    now() + interval '7 days'
  ),
  (
    '00000000-0000-0000-0000-000000000021',
    'Admins only',
    'admins-live/monday-voice.webm',
    'audio/webm',
    'admins',
    null,
    'published',
    now(),
    now() + interval '7 days'
  ),
  (
    '00000000-0000-0000-0000-000000000021',
    'Old founding',
    'founding-superseded/monday-voice.webm',
    'audio/webm',
    'active',
    '2026-07',
    'superseded',
    now() - interval '8 days',
    now() + interval '1 days'
  ),
  (
    '00000000-0000-0000-0000-000000000021',
    'Expired founding',
    'founding-expired/monday-voice.webm',
    'audio/webm',
    'active',
    '2026-07',
    'published',
    now() - interval '8 days',
    now() - interval '1 days'
  );

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000022';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000022","role":"authenticated"}';

select is(
  (select count(*)::integer from public.voice_drops),
  2,
  'founding mama table SELECT is only her live active drop plus all_mamas'
);

select ok(
  exists (select 1 from storage.objects where name = 'founding-live/monday-voice.webm'),
  'founding mama can read the live Founding object (Today playback / signed URL)'
);

select ok(
  exists (select 1 from storage.objects where name = 'all-mamas-live/monday-voice.webm'),
  'founding mama can read an all_mamas object'
);

select ok(
  not exists (select 1 from storage.objects where name = 'c2-live/monday-voice.webm'),
  'founding mama cannot read the C2 cohort object'
);

select ok(
  not exists (select 1 from storage.objects where name = 'admins-live/monday-voice.webm'),
  'founding mama cannot read an admins-only object'
);

select ok(
  not exists (select 1 from storage.objects where name = 'founding-superseded/monday-voice.webm'),
  'founding mama cannot read a superseded take'
);

select ok(
  not exists (select 1 from storage.objects where name = 'founding-expired/monday-voice.webm'),
  'founding mama cannot read an expired take'
);

select ok(
  not exists (select 1 from storage.objects where name = 'orphan-upload/monday-voice.webm'),
  'founding mama cannot list/read an unpublished upload'
);

select is(
  (select count(*)::integer from storage.objects where bucket_id = 'voice-drops'),
  2,
  'founding mama cannot list the rest of the bucket'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000023';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000023","role":"authenticated"}';

select ok(
  exists (select 1 from storage.objects where name = 'c2-live/monday-voice.webm'),
  'C2 mama can read her cohort object'
);

select ok(
  not exists (select 1 from storage.objects where name = 'founding-live/monday-voice.webm'),
  'C2 mama cannot read the Founding object'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000024';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000024","role":"authenticated"}';

select ok(
  exists (select 1 from storage.objects where name = 'all-mamas-live/monday-voice.webm')
  and not exists (select 1 from storage.objects where name = 'founding-live/monday-voice.webm'),
  'pending mama can hear all_mamas but not an active-cohort drop'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000025';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000025","role":"authenticated"}';

select is(
  (select count(*)::integer from storage.objects where bucket_id = 'voice-drops'),
  0,
  'refunded mama cannot read any voice-drop object'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000021';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000021","role":"authenticated"}';

select is(
  (select count(*)::integer from storage.objects where bucket_id = 'voice-drops'),
  7,
  'Callie can read every object, including superseded, expired, and pre-publish orphans'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000022';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000022","role":"authenticated"}';

select throws_ok(
  $$
    insert into storage.objects (bucket_id, name, owner, owner_id)
    values (
      'voice-drops',
      'mama-upload/monday-voice.webm',
      '00000000-0000-0000-0000-000000000022',
      '00000000-0000-0000-0000-000000000022'
    )
  $$,
  '42501',
  null,
  'founding mama cannot insert into the voice-drops bucket'
);

select * from finish();
rollback;
