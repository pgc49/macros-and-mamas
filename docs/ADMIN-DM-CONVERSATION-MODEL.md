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
  check (participant_low::text < participant_high::text),
  unique (participant_low, participant_high)
);

alter table public.messages
  add column admin_dm_conversation_id uuid null
    references public.admin_dm_conversations(id) on delete restrict,
  add column recipient_id uuid null
    references public.profiles(id) on delete set null;
```

`client_id` remains required for backward compatibility:

- mama DM: unchanged, `client_id = mama`
- new admin DM: `client_id = participant_low`
- legacy admin DM: keep its existing `client_id` and attachment path

All new code groups admin DMs exclusively by `admin_dm_conversation_id`, never
by `client_id`.

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

`ensure_admin_dm_conversation(peer_id)` is an authenticated, security-invoker
RPC. It verifies caller + peer are admins, orders the pair, and returns the
existing row or inserts one. A unique constraint handles concurrent creation.

## Legacy backfill

The migration is additive and must fail closed if preflight assumptions change:

1. Find every message whose `client_id` profile is admin.
2. Derive the distinct admin pair from `sender_id`, `client_id`, and the other
   sender in that legacy owner bucket.
3. Assert every bucket maps to exactly two admins.
4. Insert one conversation per unique pair.
5. Set only `admin_dm_conversation_id` and `recipient_id`.
6. Do **not** alter:
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
db.markAdminDmRead(conversationId, readerId)
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
- Mama/customer code is unchanged.

Realtime filters:

- mama DM: `client_id=eq.<mama>`
- admin DM: `admin_dm_conversation_id=eq.<conversation>`

## Notifications

`message-notify` routes admin DMs only to `recipient_id`.

- Push URL: `/admin?tab=messages&dm=<conversation-id>`
- Unread badge: only rows with `recipient_id = target admin`
- Durable outbox/idempotency behavior remains unchanged

The old inference from `client_id` or “first other sender” is removed after
backfill verification.

## RLS

`admin_dm_conversations`:

- SELECT: authenticated caller is either participant (admins may retain global
  moderation visibility only if explicitly desired)
- INSERT: through guarded RPC
- UPDATE/DELETE: no browser grants

`messages` keeps existing mama RLS. Admin-message validation is enforced by
triggers and executable negative tests. The model does not grant mamas access
to admin conversations.

## Rollout

1. Merge/apply additive schema + backfill while old app remains live.
2. Validate row/path/signing invariants in production.
3. Deploy new admin app/query code.
4. Verify one unified Callie↔Patrick thread and send/read/reply/reaction/media.
5. Add a temporary third-admin test account:
   - A↔B and A↔C produce different conversation IDs;
   - previews/unread/receipts never cross pairs.
6. Remove test account.
7. Keep legacy columns and compatibility paths through rollback window.

Rollback is application-only: retain added table/columns and run the previous
app. No destructive database reversal.

## Required automated tests

- pair uniqueness under concurrent ensure calls;
- A↔B and A↔C separation with A as lowest UUID;
- unauthorized/non-admin ensure denied;
- legacy 5+46 rows become one pair without changing IDs/client IDs/paths;
- all three current attachments remain accessible;
- admin client-detail and inbox open the same conversation;
- recipient-only, monotonic read receipt;
- notification routing and unread badge recipient-only;
- reply parent must share conversation;
- idempotent send retries stay in the same conversation;
- old app can still read new rows under `participant_low` fallback.

## Relationship to blocked PR #220

PR #220 remains draft and blocked. Its receipt/storage hardening should be
rebuilt on top of this conversation model; its attempted UUID canonicalization
must not be applied.

