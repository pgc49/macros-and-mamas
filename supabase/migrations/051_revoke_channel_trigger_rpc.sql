-- Trigger helpers must not be callable via PostgREST RPC.
-- Same pattern as 032_revoke_trigger_rpc.sql.

revoke all on function public.protect_conversation_message_edits() from public;
revoke all on function public.protect_conversation_message_edits() from anon, authenticated;

revoke all on function public.protect_conversation_member_updates() from public;
revoke all on function public.protect_conversation_member_updates() from anon, authenticated;

revoke all on function public.enforce_channel_reply_same_conversation() from public;
revoke all on function public.enforce_channel_reply_same_conversation() from anon, authenticated;

-- Membership helper is used in RLS; keep authenticated execute, drop anon/public.
revoke all on function public.is_active_conversation_member(uuid) from public;
revoke all on function public.is_active_conversation_member(uuid) from anon;
grant execute on function public.is_active_conversation_member(uuid) to authenticated;
