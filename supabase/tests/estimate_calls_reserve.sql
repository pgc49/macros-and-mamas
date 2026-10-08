begin;

select plan(7);

select is(
  public.reserve_estimate_call(
    '11111111-1111-4111-8111-111111111111',
    'coach',
    30,
    'ask-1'
  ),
  true,
  'first reserve with a request_id inserts'
);

select is(
  public.reserve_estimate_call(
    '11111111-1111-4111-8111-111111111111',
    'coach',
    30,
    'ask-1'
  ),
  true,
  'second reserve with the same request_id is the one retry'
);

select is(
  public.reserve_estimate_call(
    '11111111-1111-4111-8111-111111111111',
    'coach',
    30,
    'ask-1'
  ),
  false,
  'third reserve with the same request_id is refused'
);

select is(
  (select count(*)::integer from public.estimate_calls where request_id = 'ask-1'),
  1,
  'same request_id never inserts a second row'
);

select is(
  public.reserve_estimate_call(
    '22222222-2222-4222-8222-222222222222',
    'coach',
    30,
    'ask-1'
  ),
  false,
  'another mama cannot reuse this request_id'
);

insert into public.estimate_calls (profile_id, type, request_id, created_at)
values (
  '11111111-1111-4111-8111-111111111111',
  'coach',
  'ask-old',
  now() - interval '2 minutes 1 second'
);

select is(
  public.reserve_estimate_call(
    '11111111-1111-4111-8111-111111111111',
    'coach',
    30,
    'ask-old'
  ),
  false,
  'same request_id after 2 minutes is refused'
);

insert into public.estimate_calls (profile_id, type, request_id, created_at)
select
  '11111111-1111-4111-8111-111111111111',
  'coach',
  'spent-' || g,
  now()
from generate_series(1, 28) as g;

select is(
  public.reserve_estimate_call(
    '11111111-1111-4111-8111-111111111111',
    'coach',
    30,
    'ask-cap'
  ),
  false,
  'cap is still enforced on a new request_id'
);

select * from finish();

rollback;
