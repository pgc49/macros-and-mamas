# Stage 3 — Security review (2026-08-09)

Scope: cohort/alumni `conversations`, `conversation_members`, `conversation_messages`,
`channel_prompts`, `channel-attachments` storage, `/api/channel-notify`,
`/api/channel-members`, `/api/channel-prompts-cron`, Messages group UI.

## Verdict

**One high storage-delete IDOR** found and fixed (any member could delete any
channel attachment). Remaining channel writes stay gated by membership RLS,
protect triggers, or JWT/CRON_SECRET on Functions. Notify fanout is claim-before-send.

## Trust boundaries

| Surface | Auth | Risk if broken |
| --- | --- | --- |
| Supabase client → channel tables | JWT + RLS + protect triggers | Read/post in wrong room; forge system kind; undelete |
| Storage `channel-attachments` | JWT + storage policies | Read/upload/delete others’ media |
| `POST /api/channel-notify` | Sender JWT **or** `CRON_SECRET` (system only) | Spam push / notify for others’ messages |
| `POST /api/channel-members` | JWT + active member/admin | Enumerate mama names outside room |
| `POST /api/channel-prompts-cron` | `CRON_SECRET` | Post system prompts / double-post |
| Paid → channel enroll / activation cohort | Stripe webhook / admin approve (service role) | Wrong cohort room |

## Findings

### Fixed / hardened now
1. **Attachment delete IDOR (high)** — storage delete previously allowed any active
   member. Paths are now `{conversationId}/{userId}/…`; delete scoped to own folder
   or admin (`050_channels_harden.sql`).
2. **Attachment path unbound to conversation (medium)** — CHECK + insert policy
   require path under the message’s `conversation_id` (and user folder for non-admin).
3. **Soft-delete undelete (medium)** — protect trigger returns `OLD` once
   `deleted_at` is set (sticky delete for non-service).
4. **Reply cross-conversation (low)** — trigger enforces `reply_to` same conversation.
5. **Notify race / duplicate push (medium)** — claim `notified_at` with
   `notified_at=is.null` before fanout.
6. **System prompts never pushed (medium)** — cron claims due, posts, then calls
   `/api/channel-notify` with `CRON_SECRET`; claim rolled back if post fails.
7. **Cron auth on notify (low)** — Bearer secret is timing-safe length-checked;
   cron path rejects non-system messages with a sender.
8. **channel-members IDOR / abuse (low)** — membership gate; UUID validation;
   labels only for senders who already posted in that conversation; max 100 ids.
9. **Activation wrong cohort (low)** — unlabeled activation uses `paid_at` window,
   not “now”.
10. **Admin moderation UX (low)** — admins can delete others’ channel messages in
    the app; edit remains own-only.
11. **Error leakage (low)** — Messages panel maps errors to friendly copy.
12. **Trigger RPC exposure (low)** — revoked EXECUTE on channel protect/enforce
    trigger helpers from `anon`/`authenticated` (`051_revoke_channel_trigger_rpc.sql`).
13. **Orphan attachment on failed insert (low)** — client removes uploaded object
    if the `conversation_messages` insert fails.

### Accepted residual
- Compromised **admin session** can moderate any enrolled channel (by design).
- Compromised **`CRON_SECRET`** can post prompts / push system notify (pre-existing class).
- **Sockpuppet accounts** in the same cohort can still post spam; moderation is human.
- Members can see first names of senders who have already posted (product requirement).
- Notify claim-before-send can skip retries if push fails after claim (prefer no duplicates).

## What attackers cannot do (with current code)
- Mama A cannot read Mama B’s 1:1 `messages` or join another cohort’s channel via RLS.
- Non-members cannot SELECT/INSERT channel messages or storage objects for a room.
- Clients cannot INSERT `kind=system` (non-admin) or voice-memo MIME (non-admin).
- Clients cannot clear `removed_at` / forge membership identity fields.
- Clients cannot undelete a soft-deleted channel message.
- Arbitrary JWT holders cannot call channel-notify for someone else’s message.
- channel-members cannot resolve arbitrary profile UUIDs outside posters in that room.
