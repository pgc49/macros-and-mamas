# Pair-unique admin DM conversations (design draft)

Status: **design only**. Do not apply a migration or merge the blocked RLS PR
until this model and rollout are explicitly approved.

## Why

`messages.client_id` currently means both “mama thread owner” and “admin DM
thread key.” That is not pair-unique:

- A↔B and A↔C can collapse when A is chosen as the canonical UUID.
- Legacy Callie↔Patrick history is split across both admins' `client_id`s.
- Changing legacy `client_id` would violate attachment path constraints.

Production inventory at design time:

| Legacy `client_id` owner | Rows | Senders | Attachments |
|---|---:|---:|---:|
| Callie | 5 | Callie + Patrick | 1 |
| Patrick | 46 | Callie + Patrick | 2 |

There are exactly two admins today. All 51 rows represent the same pair, but
their IDs, `client_id`, reply links, reaction links, and attachment paths must
remain unchanged.

## Target schema

```sql
create table public.admin_dm_conversations (
  id uuid primary key default gen_random_uuid(),
  participant_low uuid not null references public.profiles(id) on delete restrict,
  participant_high uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (participant_low < participant_high),
  unique (participant_low, participant_high)
);

alter table public.messages
  add column admin_dm_conversation_id uuid null
    references public.admin_dm_conversations(id) on delete restrict,
  add column recipient_id uuid null
    references public.profiles(id) on delete set null;

create index messages_admin_dm_created_idx
  on public.messages (admin_dm_conversation_id, created_at desc, id desc)
  where admin_dm_conversation_id is not null;

create index messages_recipient_unread_idx
  on public.messages (recipient_id, created_at desc)
  where recipient_id is not null and read_at is null and deleted_at is null;
```

`client_id` remains required for backward compatibility:

- mama DM: unchanged, `client_id = mama`
- new admin DM: `client_id = participant_low`
- legacy admin DM: keep its existing `client_id` and attachment path

All new code groups admin DMs exclusively by `admin_dm_conversation_id`, never
by `client_id`. Returned compatibility `clientId` is always
`participant_low`, never the latest row's legacy owner.

## Invariants

Before insert, a database trigger must enforce:

1. If `admin_dm_conversation_id` is null, the existing mama-thread rules apply.
2. If set:
   - sender and recipient are the two stored participants;
   - sender differs from recipient;
   - both profiles currently have `role='admin'`;
   - `client_id` is set to `participant_low`;
   - recipient is immutable.
3. Replies stay within the same `admin_dm_conversation_id`.
4. Only `recipient_id` can set `read_at`; receipt remains monotonic.
5. Browser clients cannot set `notified_at`.

Complete receipt state machine:

- mama→coach: `recipient_id = null`; any current admin may acknowledge once;
- coach→mama: `recipient_id = client_id`; only that mama may acknowledge;
- admin→admin: `recipient_id` is the other conversation participant;
- every receipt is monotonic, including service-role operations;
- `notified_at` is service-role-only on both INSERT and UPDATE.

`ensure_admin_dm_conversation(peer_id)` is an authenticated, security-invoker
RPC. `authenticated` receives INSERT only with an RLS `WITH CHECK` requiring:
caller is one participant, both participants are current admins, low/high order
is valid, and participants differ. Direct insert is therefore no less safe than
the RPC. The RPC uses `INSERT ... ON CONFLICT DO NOTHING`, then SELECT.

## Legacy backfill

The migration is additive and must fail closed if preflight assumptions change:

1. Lock admin-owned message writes for the migration transaction.
2. For every admin-owned legacy bucket, derive members as the distinct union of
   `client_id` and every `sender_id`.
3. Require exactly two current admins in each bucket.
4. Order each pair using native UUID ordering and merge buckets sharing that
   ordered pair.
5. Insert one conversation per unique pair.
6. Set only `admin_dm_conversation_id` and `recipient_id`.
7. Do **not** alter:
   - message ID
   - `client_id`
   - attachment path/name
   - reply/reaction references
   - timestamps/content

For owner-sent legacy rows, recipient is the other member of the derived pair.
For peer-sent rows, recipient is the legacy owner when that owner is the other
pair member.

The migration must verify post-backfill:

- 51/51 current admin rows linked;
- exactly one Callie↔Patrick conversation;
- all three attachment paths unchanged and still signable;
- no row has sender = recipient;
- no admin-owned message remains unlinked.
- every reply parent resolves to the same resulting conversation.

After backfill, replace the current reply trigger:

- linked admin message may reply only to a linked parent with the same
  `admin_dm_conversation_id`;
- unlinked mama message may reply only to an unlinked parent with the same
  `client_id`;
- linked↔unlinked replies are rejected.

Freeze `admin_dm_conversation_id`, `recipient_id`, sender, client, reply,
created time, and `client_message_id` after insert.

## Query/API contract

### Inbox RPC

Replace overloaded `{clientId}` rows with:

```ts
type InboxThread =
  | {
      threadType: "mama";
      threadId: string;      // mama profile UUID
      clientId: string;
      participantIds: string[];
    }
  | {
      threadType: "admin";
      threadId: string;      // admin_dm_conversations.id
      clientId: string;      // legacy compatibility only
      participantIds: [string, string];
    };
```

The RPC unions:

- mama threads grouped by `messages.client_id` where client profile is not admin;
- admin threads grouped by `admin_dm_conversation_id`.

Latest preview, unread counts, deterministic ordering, and participant IDs are
computed independently per returned `threadId`. Admin unread counts require
`recipient_id = auth.uid()`.

### Data layer

Add explicit methods rather than overloading mama APIs silently:

```js
db.ensureAdminDmConversation(peerId)
db.loadAdminDmMessages(conversationId, options)
db.sendAdminDmMessage({ conversationId, recipientId, ... })
db.markAdminDmRead(conversationId) // database derives reader from auth.uid()
```

Existing `loadMessages(clientId)` / `sendMessage({clientId})` remain mama-thread
methods.

## UI changes

`AdminMessages.active` becomes:

```js
{ type: "dm", threadType: "mama", threadId, clientId, peerId }
{ type: "dm", threadType: "admin", threadId, clientId, peerId }
{ type: "channel", threadId }
```

- React keys, loading sequence maps, send guards, and Realtime filters use
  `threadType:threadId`.
- Starting an admin thread first calls `ensureAdminDmConversation(peerId)`.
- Admin client-detail messaging uses the same admin conversation ID—not the
  selected profile UUID.
- `AdminPortal` parses `?dm=<conversation-uuid>`, verifies caller membership,
  and passes a discriminated initial admin thread to `AdminMessages`.
- Mama/customer code is unchanged.

Realtime filters:

- mama DM: `client_id=eq.<mama>`
- admin DM: `admin_dm_conversation_id=eq.<conversation>`

`message_reactions` has no conversation column. Keep one RLS-filtered global
reaction subscription and refetch only the active authorized thread when the
changed `message_id` is currently loaded. Do not denormalize an unchecked
conversation ID onto reactions.

## Notifications

`message-notify` routes admin DMs only to `recipient_id`.

- Push URL: `/admin?tab=messages&dm=<conversation-id>`
- Unread badge: only rows with `recipient_id = target admin`
- Durable outbox/idempotency behavior remains unchanged

Idempotent duplicate recovery must compare both
`admin_dm_conversation_id` and `recipient_id`; matching only legacy
`client_id` is forbidden.

The notifier requires non-null conversation ID + validated `recipient_id`.
Current profile roles, `client_id`, and “first other sender” are never used to
infer the target after backfill verification.

## RLS

Decision: **admin DMs are pair-private**, not globally visible to every admin.

`admin_dm_conversations`:

- SELECT: authenticated caller is either participant
- INSERT: RLS `WITH CHECK` enforces caller membership + two current admins;
  guarded RPC is the normal path
- UPDATE/DELETE: no browser grants

Message SELECT/UPDATE policies branch:

- `admin_dm_conversation_id is null`: existing mama-thread rules;
- linked admin message: caller must be a conversation participant.

Reaction policies join through the message and apply the same branch. Storage
policies join `storage.objects.name = messages.attachment_path`; linked admin
attachments require pair membership, while unlinked mama attachments keep
existing mama/coach behavior. This removes the current global-admin bypass for
pair-private content.

New admin attachments use:
`admin-dm/{conversation-id}/{sender-id}/{uuid-file}`. Legacy paths remain
unchanged and are authorized through the linked message row—not folder prefix.

## Rollout

1. Freeze admin provisioning for the rollout.
2. Apply additive schema/backfill plus a temporary compatibility trigger.
3. Compatibility trigger handles legacy-shaped admin writes only while exactly
   two admins exist: derive the sole pair, set conversation/recipient, and
   reject ambiguity.
4. Validate row/path/signing invariants in production.
5. Deploy new admin app/query code.
6. Verify one unified Callie↔Patrick thread and send/read/reply/reaction/media.
7. Close the old-app rollback window, disable compatibility mode, and establish
   the conversation-aware build as the oldest permitted rollback.
8. In isolated staging—not production—create a third admin:
   - A↔B and A↔C produce different conversation IDs;
   - previews/unread/receipts never cross pairs.
9. Clean up staging messages, reactions, outbox rows, attachments,
   conversations, sessions, then profile.
10. Keep legacy columns/paths indefinitely for attachment compatibility.

Before step 7, the immediately previous app may be used because the
compatibility trigger links its writes. After a third-admin conversation can
exist, rollback to a client unaware of conversation IDs is forbidden. Database
changes remain additive; no destructive reversal.

## Required automated tests

- pair uniqueness under concurrent ensure calls;
- A↔B and A↔C separation with A as lowest UUID;
- unauthorized/non-admin ensure denied;
- direct INSERT obeys the same pair/admin RLS as ensure RPC;
- legacy 5+46 rows become one pair without changing IDs/client IDs/paths;
- legacy-shaped write is linked by compatibility trigger with two admins;
- compatibility write and third-admin provisioning fail once ambiguity exists;
- all three current attachments remain accessible;
- B cannot read/react/sign A↔C messages or attachments;
- admin client-detail and inbox open the same conversation;
- recipient-only, monotonic read receipt;
- notification routing and unread badge recipient-only;
- reply parent must share conversation;
- idempotent send retries stay in the same conversation;
- pre-cutover old app writes remain linked during compatibility window;
- post-window rollback to a conversation-unaware build is rejected by runbook.

## Relationship to blocked PR #220

PR #220 remains draft and blocked. Its receipt/storage hardening should be
rebuilt on top of this conversation model; its attempted UUID canonicalization
must not be applied.

