-- Minimal estimate_calls table for reserve_estimate_call tests.
-- No FK to profiles: the isolated messaging schema has its own users.

create table if not exists public.estimate_calls (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  type text not null,
  created_at timestamptz not null default now()
);
