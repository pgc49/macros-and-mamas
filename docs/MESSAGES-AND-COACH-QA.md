# Messages, time zones, meal ideas, and Callie’s coach path

Answers from the current Macros and Mamas codebase (researched 4 Sep 2026). No product changes in this pass.

---

## 1. How Messages works today

Two stacks, not one.

### 1:1 DMs

Live in the `messages` table. One thread per mama, keyed by `client_id` (her profile id).

Columns include:

- `body` — text, max 2000 characters
- `sender_id`
- `created_at`
- `read_at`
- optional attachment fields
- `kind` — `chat` or `announcement`
- `reply_to_id`
- edit/delete timestamps
- `client_message_id` for idempotency

Reactions are a separate table (`message_reactions`, one emoji per user per message). Schema comment: no mama-to-mama DMs.

Source: `supabase/migrations/025_messages.sql`

### Group chat

A different model: `conversations` + `conversation_members` + `conversation_messages`.

- Cohort rooms: Founding (`2026-07`), August (`2026-08`)
- Empty alumni shell
- Members have `notify_level`: `all` | `highlights` | `mute`
- Channel `kind`: `chat` | `system` | `voice`

Source: `supabase/migrations/047_channels.sql`

### Realtime, not polling

Both UIs subscribe to Supabase `postgres_changes` and then **reload the whole list**.

- Mama DM filter: `client_id=eq.{userId}`
- Channel subscriptions have **no conversation filter**, so any group insert refreshes every open Messages tab

Source: `src/components/MessagesPanel.jsx`

### Push

Web Push via `push_subscriptions` and a service worker. Enable path is standalone PWA (home-screen icon) + permission — not ordinary Safari tabs.

Source: `src/lib/push.js`

Notify is not inline in the insert. Client fires:

- `/api/message-notify` for DMs
- `/api/channel-notify` for channels

An outbox + GitHub cron retries failed jobs.

Source: `functions/api/message-notify.js`

### Attachments

Private buckets:

- DMs: `message-attachments` — path `{client_id}/{uuid}-{filename}`
- Channels: `channel-attachments` — path `{conversationId}/{userId}/…`

Images + PDF, 10 MB. Admin-only audio/voice memos on DMs. Mamas can play them, not send them.

### Structured content: text + file only

There is no JSON payload, card, or plan-block column. A “card” would have to be pasted text, an image/PDF, or a new column. Meal plans live in `client_week_plans` / `client_meal_plans`, not in chat.

---

## 2. Callie DM vs group messages

**Not the same table.**

- DMs = `messages`
- Group = `conversation_messages`

RLS, notify, storage, and `kind` enums are separate on purpose.

Source: `docs/STAGE-3-CHANNELS.md`

### Who can write a DM

- Insert requires `sender_id = auth.uid()`
- Mama: only when `auth.uid() = client_id` (her own thread)
- Admin: any thread
- Service role: broadcasts (`kind=announcement` into each mama thread via `/api/admin-broadcast`)

### Who can write a group message

- Active members, if the room is not `read_only`
- Non-admin insert is `kind=chat` only, no `audio/` MIME
- Admins can post `system` / `voice`
- Cron posts `kind=system`, `sender_id=null` from `channel_prompts`

Source: `functions/api/channel-prompts-cron.js`

### Bot / system sender today

- **DMs:** no bot profile and no `system` kind. Closest thing is admin **announcement** broadcasts, still a human admin `sender_id`.
- **Channels:** yes — system prompts with `sender_id` null.
- Mama-facing 1:1 labels any non-mama sender as **Callie**, including Patrick.

Source: `src/components/MessagesThread.jsx`

A coach agent writing into `messages` as Callie’s user would look like Callie to the mama. To make a handoff visible you need a distinct sender (or a new `kind`) plus admin UI that does not collapse it to “Callie.”

---

## 3. Time zone, `meal_logs.date`, `created_at`

**Timezone is not on the profile.** No `timezone` / `time_zone` column in schema or migrations. Stage 5 spec still says “store timezone on profile; default `America/Los_Angeles`” — that is future work, not shipped.

Source: `docs/STAGE-5-GOALS.md`

**`meal_logs.date` is the client’s local calendar day.** The app sets it with `localDateIso()` (`YYYY-MM-DD` from `getFullYear` / `getMonth` / `getDate`), then inserts that string. Not server UTC. A mama in Tokyo and one in California on the “same UTC instant” get different dates.

Sources: `src/utils/dates.js`, `src/db/db.js`

**`meal_logs` has no `created_at`.** Columns are `id`, `profile_id`, `date`, `name`, `cal`, `p`, `c`, `f`, plus later `source` / `via` / `slot`. You cannot tell “logged Tuesday night for Monday” vs “logged Monday.”

Elsewhere `created_at` is `timestamptz not null default now()` — Postgres UTC clock. Same for `messages.created_at` and `estimate_calls.created_at` (the 24h meal-idea window is rolling UTC, not local midnight).

`AdminClientSummary` caches by `new Date().toISOString().slice(0, 10)` (UTC date), while meal logs use local date. Those can disagree around midnight.

---

## 4. Existing summary / “check-in” objects

There is **no weekly check-in row** Callie fills out. Marketing says “weekly check-ins”; ops meaning is “Callie DMed in the last 7 days.”

| Object | What it actually is | Coach should read? |
| --- | --- | --- |
| `checkins` | Habit checklist taps (`macros`, `water`, `steps`, `sun`, `home`, `strength` + custom goals) keyed by `week_start` + `day` | Yes, as adherence, not as a coach note |
| `profiles.coach_note` | Callie → mama banner on Today; mama can dismiss; trigger-locked so she cannot edit it | Yes — her own note to that mama |
| `client_summaries` | Admin-only AI blurb, generate-on-open, cached by `for_date`. Explicitly **never** `coach_note`. Payload is meals/water/weigh-ins/habits/ranges — **no DM bodies** | Yes — the closest “read this before you text” object |
| `needsWeeklyNote` | Roster flag: paid client with no admin DM, or last admin DM ≥ 7 days | Process signal, not a document |
| `client_week_plans` / `client_meal_plans` | Her committed week / Callie’s published draft | Yes if the question is food, not mood |

`/api/client-summary` is admin JWT, single-shot JSON, refuses payloads that look like they contain message bodies.

Source: `functions/api/client-summary.js`

---

## 5. Where Callie’s guide and principles live

**Not one document.** Several sources that must stay in sync:

1. **Recipe bank** — `src/content/data.js` `RECIPES` is canonical for the app; `functions/_shared/callieRecipes.js` `CALLIE_RECIPES` is the copy injected into AI prompts. A test asserts they are equal (`src/content/recipes.test.jsx`).
2. **Meal formulas** — `SKELETONS` in `src/content/data.js` (protein + carb patterns per slot).
3. **“Healthy-macro guide”** — UI copy only. The actual rules are prompt strings: high protein, whole foods, max 2 whole eggs, honey/maple/applesauce, no invented macros, stay in her bands.
   - `functions/_shared/clientMealIdeaPrompt.js`
   - `functions/_shared/mealPlanPrompt.js`
4. **Diet / allergen gates** — `functions/_shared/foodPrefs.js` (`buildDietSafetyBlock`).
5. **Per-mama tastes** — `profiles.pref_b/l/d/s`, `season_note`, `allergens`, `food_avoids`, plus her My meals.

There is no standalone “Callie principles.md.” Changing house style means editing those prompt files (and keeping `RECIPES` / `CALLIE_RECIPES` twins aligned).

---

## 6. `/api/meal-idea`: function calling and streaming

**Single-shot JSON. No tools. No streaming.**

`callOpenRouter` POSTs chat completions with `response_format: { type: "json_object" }`, waits for the full body, then `parseJsonLoose`.

Modes:

- `describe` — one meal
- `options` — 2–3 meals
- `eating_out` — 5 ranked, with menu photos

Sources: `functions/api/meal-idea.js`, `functions/_shared/openrouter.js`

Same pattern for `/api/estimate`, `/api/meal-suggest`, `/api/meal-plan`, `/api/client-summary`. `/api/analyze` is a 410 stub (“use `/api/estimate`”).

---

## 7. Rate limits and cost tracking

Per-mama **call counts** in `estimate_calls` (rolling 24h UTC unless noted). Admins are uncapped on meal-idea.

| Endpoint | Cap | `estimate_calls.type` |
| --- | --- | --- |
| `/api/meal-idea` | 20 / 24h | `meal_idea` |
| `/api/meal-suggest` | 5 / 24h (retries logged separately, not counted) | `meal_suggest` |
| `/api/estimate` | 15 / hour and 40 / 24h | estimate types |
| `/api/meal-plan` | none (admin-only) | — |
| `/api/client-summary` | none (admin-only) | — |
| `/api/support` | 5 / day | separate |

**No token, dollar, or per-tenant spend table.** OpenRouter usage is not persisted. `ai_failures` is failure telemetry (`credits`, `rate_limited`, `timeout`, …) for the admin dashboard, not a bill. This is one product / one coach — there is no tenant meter to show.

---

## 8. How Callie sees and answers DMs

**In-app, plus web push. Not email for mama → Callie.**

- **Admin Messages** (`/admin?tab=messages&client=`): inbox + thread, desktop split / mobile full-screen. `src/admin/AdminMessages.jsx`
- **Client card**: same DM thread while she reviews logs. `src/admin/AdminClientMessages.jsx`
- **Push**: mama → Callie goes **only** to admin profiles whose email matches `CALLIE_NOTIFY_EMAIL` (default `calista@nourishwithcalista.com`). Fail closed if none match. Never Tech Guy. Deep link is the admin thread. `functions/api/message-notify.js`
- **Email**: used as fallback when **Callie texts a mama who has no push sub**. Not the other direction. Comment in that file: “Callie already gets web push; no duplicate email.”

If Callie has not installed the PWA / allowed push, mama DMs can silently sit in the inbox.

### Handoff that would actually work on her side

1. Bot writes into the **same** `messages` row for that `client_id` (mama already has one thread).
2. Use a **distinct `sender_id`** (or a new `kind`) so admin UI can show “Coach / pending” vs “Callie.” Today any admin sender brands as Callie to the mama.
3. Do **not** auto-`signOut` or swap sessions when the bot’s identity appears in another tab.
4. Notify: either send as Callie (mama thinks it’s her) or add a route; current mama→Callie path is push-only to Callie’s devices.
5. Give Callie an inbox filter (“needs me”) and a one-tap “I’ll take this” that does not revoke the bot’s ability to read the thread.
6. Do not put the reply in email — she does not work mama DMs from email today.

---

## 9. Fragile / half-built — do not lean on these

- **Two stacks.** Do not hang a coach agent on `conversation_messages` thinking it is the DM. DMs are `messages` only.
- **No structured payload.** Cards / plan blocks need a new column (or a link + renderer). Parsing `body` will break edit/delete, previews, push, and the 2000-char check.
- **Realtime is “refetch everything.”** Channel listeners are unfiltered. A busy group plus a bot will thrash every open tab.
- **Mama → Callie is push-only.** No email safety net. Outbox/cron exists because notify already drops.
- **Sender branding.** Patrick, a future bot, and Callie all render as “Callie” to the mama unless you change `incomingSenderLabel`.
- **Identity is immutable** (`sender_id`, `client_id`, `created_at`, `kind`, attachments, `reply_to_id`). You cannot rewrite a bot message into Callie’s later.
- **Admin↔admin thread** uses a canonical-id hack. Stay out of it.
- **Voice** is admin-record / mama-play. Channel `kind=voice` exists; mama audio is blocked by RLS.
- **`client_summaries` is UTC-dated and excludes DMs** — do not treat it as “what she said this week.”
- **No profile timezone** — do not schedule “her midnight” or infer `meal_logs.date` on the server.
- **Admin tracking UI is isolated on purpose.** Editing customer meal cards for admin once blanked production (PR #54). Read `AdminClientTracking` as a mirror, not a shared widget.

### Safe to lean on

- The `messages` row as the mama↔coach transcript
- RLS (mama sees only her `client_id`)
- Attachments as files
- `client_summaries` + logs as coach context
- `CALLIE_RECIPES` + prompt files as the food brain
