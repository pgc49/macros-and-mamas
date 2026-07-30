-- Trigger/security-definer helpers should not be callable via PostgREST RPC.
-- Triggers still run (table owner). Keep is_admin() executable for RLS.

revoke all on function public.protect_message_edits() from public;
revoke all on function public.protect_message_edits() from anon, authenticated;

revoke all on function public.protect_macros_approval() from public;
revoke all on function public.protect_macros_approval() from anon, authenticated;

revoke all on function public.protect_payment_columns() from public;
revoke all on function public.protect_payment_columns() from anon, authenticated;

revoke all on function public.protect_profile_privileges() from public;
revoke all on function public.protect_profile_privileges() from anon, authenticated;

-- Signup trigger only — not a client RPC.
revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon, authenticated;
