-- Support reports (WhatsApp / in-app tech help → GitHub issues).
-- Rate-limit + audit log. Screenshots live in private Storage bucket.
-- Run this entire file in the Supabase SQL editor.

create table if not exists public.support_reports (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete set null,
  email text not null,
  name text,
  message text not null,
  route text,
  user_agent text,
  app_version text,
  screenshot_path text,
  github_issue_url text,
  github_issue_number int,
  delivery text not null default 'pending',
  created_at timestamptz not null default now()
);

comment on table public.support_reports is
  'Mama tech/support reports from /support. Primary delivery is a private GitHub issue.';
comment on column public.support_reports.delivery is
  'github | email_fallback | failed';
comment on column public.support_reports.screenshot_path is
  'Path in private support-screenshots bucket (not a public URL).';

create index if not exists support_reports_email_created_idx
  on public.support_reports (lower(email), created_at desc);

create index if not exists support_reports_profile_created_idx
  on public.support_reports (profile_id, created_at desc)
  where profile_id is not null;

alter table public.support_reports enable row level security;

-- Clients never read/write directly — Pages Function uses service role.
drop policy if exists "support_reports_select_admin" on public.support_reports;
create policy "support_reports_select_admin"
  on public.support_reports for select
  to authenticated
  using (public.is_admin());

-- Private screenshot bucket (service role only).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'support-screenshots',
  'support-screenshots',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- No anon/authenticated storage policies — uploads via service role only.
