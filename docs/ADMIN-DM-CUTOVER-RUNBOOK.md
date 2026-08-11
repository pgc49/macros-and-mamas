# Admin DM cutover runbook (draft — do not execute)

This runbook is for a future explicit `ship it`. All SQL is held until then.

## 1. Freeze and preflight

Do not add/remove/demote admins during cutover.

Verify:

- exactly two current admins (Callie + Patrick);
- admin-DM buckets contain 5 + 46 rows;
- each bucket's member union is exactly those two admins;
- exactly three referenced attachment paths exist;
- reply parents remain in the same derived pair;
- no admin-owned row has a non-admin sender.

Abort on any mismatch.

## 2. Apply additive migration

Apply `admin_dm_conversations` migration before deploying the conversation-aware
app. It locks profiles/messages for the backfill transaction, preserves runtime
mode, and keeps compatibility/provisioning freeze enabled.

Post-migration verify:

- one Callie↔Patrick conversation;
- all 51 rows linked;
- all 51 recipients assigned and sender differs from recipient;
- legacy `client_id` counts remain 5 + 46;
- exactly three legacy-path stamps;
- all three objects sign/download for both active participants;
- inbox v2 returns one admin pair row.

## 3. Deploy integration preview/app

Deploy only the reviewed integration artifact. Verify:

- Callie's mama inbox and client-detail messaging;
- one unified Callie↔Patrick thread;
- latest-message landing, send/reply/react/edit/delete/read;
- three legacy files and a new conversation-path attachment;
- DM/channel push and email deep links open admin origin;
- runtime read-only/off controls and health.

## 4. Compatibility window

Keep:

```text
compatibility_enabled = true
admin_provisioning_frozen = true
```

The immediately previous two-admin app may be used for emergency rollback.
Legacy-shaped writes are stamped into the one existing pair.

Monitor for unlinked admin rows (must remain zero).

## 5. Close rollback window

After acceptance and rollback drill:

```sql
update public.admin_dm_migration_state
set
  compatibility_enabled = false,
  admin_provisioning_frozen = false,
  updated_at = now()
where singleton = true;
```

Verify conversation-unaware writes now fail. From this point, never roll back to
an app build that does not understand `admin_dm_conversation_id`.

## 6. Third-admin staging test

Run only in isolated staging:

- create Admin C;
- ensure A↔B and A↔C have different conversation IDs;
- verify B cannot read/react/sign A↔C content;
- verify recipient-only unread/read/notification behavior;
- demote C and verify message/attachment/push/email access is removed;
- clean sessions, outbox, reactions, messages, objects, conversations, profile.

Do not create a temporary third production admin.

## Rollback

- Before compatibility closes: roll back application only; keep additive DB.
- After compatibility closes: roll back only to a conversation-aware build.
- Never rewrite legacy attachment paths or reverse the backfill destructively.

