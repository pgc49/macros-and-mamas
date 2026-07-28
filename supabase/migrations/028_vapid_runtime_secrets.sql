-- Server-only VAPID key storage for send-push Edge Function.
-- Prefer Supabase secrets (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY); this table is a
-- fallback when Edge Function secrets are not set. Service role bypasses RLS;
-- no policies → anon/authenticated cannot read.

create table if not exists public.app_runtime_secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

comment on table public.app_runtime_secrets is
  'Server-only runtime secrets (e.g. VAPID). No RLS policies — service_role only.';

alter table public.app_runtime_secrets enable row level security;

revoke all on table public.app_runtime_secrets from anon, authenticated;
grant select on table public.app_runtime_secrets to service_role;
