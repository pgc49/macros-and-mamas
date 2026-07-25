-- AI failure telemetry so Callie/Patrick see OpenRouter trouble before a
-- client texts about it. Service role writes (Cloudflare Functions);
-- admins read in the portal. Run this entire file in the Supabase SQL editor.

create table if not exists public.ai_failures (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete set null,
  label text not null,
  kind text not null,
  status int,
  model text,
  detail text,
  created_at timestamptz not null default now()
);

comment on table public.ai_failures is
  'Failed OpenRouter calls by feature (label) and cause (kind). Admin-only read.';
comment on column public.ai_failures.label is
  'estimate_photo | estimate_text | meal_suggest | meal_idea | meal_plan';
comment on column public.ai_failures.kind is
  'config | auth | credits | rate_limited | timeout | network | upstream | empty | parse';

create index if not exists ai_failures_created_idx
  on public.ai_failures (created_at desc);

create index if not exists ai_failures_label_created_idx
  on public.ai_failures (label, created_at desc);

alter table public.ai_failures enable row level security;

-- Admins read; nobody inserts with a JWT (Cloudflare uses service role).
drop policy if exists "ai_failures_select_admin" on public.ai_failures;
create policy "ai_failures_select_admin"
  on public.ai_failures for select
  to authenticated
  using (public.is_admin());
