# CRM data model and stage logic

Investigation of the live Macros and Mamas admin / funnel model (30 Aug 2026). Two identities exist today: a **quiz lead** (`marketing_leads`) and an **account** (`profiles`). Stages, leftover, and drips are computed in JS, not stored as one CRM status.

Live snapshot (not product constants): 74 quiz emails, 70 non-admin profiles, 0 unpaid accounts, 0 `refunded` profiles, 5 comps, 48 paid profiles with **no matching quiz email**.

Leftover-first Leads shipped in [#304](https://github.com/pgc49/macros-and-mamas/pull/304) (`91b49a8` on `main`).

---

## Data model and stage logic

### 1. Tables / columns

There is **no `leads` table** and **no `cohorts` table**. `supabase/schema.sql` is a subset; columns below are from the production project plus migrations.

**`marketing_leads`** — one row per unique `lower(email)` (`UNIQUE (lower(email))`). Written by `/api/lead` (service role). Quiz answers + computed ranges + Meta attribution.

```sql
id uuid PK, created_at, email, first_name, last_name, source, quiz_version,
months_postpartum, feeding_status, height_in, current_weight_lbs, goal_weight_lbs,
goal, activity_level, flags[], baby_birthday,
protein/carbs/fat/calorie bands,
needs_review bool, review_reason, segment default 'main',
fbp, fbc, event_id, utm_*, landing_path, referred_by
```

**`profiles`** — one row per `auth.users.id` (created on signup). Account, payment, intake gate, cohort stamp.

```sql
id uuid PK → auth.users,
email, name, last_name, phone, age, date_of_birth,
current_weight, goal_weight, months_pp, breastfeeding, pregnant,
goal, activity, stress, insulin_resistance, diet, pref_*, season_note,
allergens[], coach_note*,
role default 'client', status default 'pending', week default 0,
paid, paid_at, refunded, comp, stripe_customer_id, stripe_payment_intent,
lab_review_purchased*,
utm_*, fbclid, landing_path, referrer_host, anon_id, attributed_at,
ambassador, cohort_label, tier (membership_tier),
stripe_subscription_id, subscription_status, subscription_*_end,
subscription_cancel_at_period_end
```

**`macros`** — intake artifact. Presence = “has intake.” `approved` + `profiles.status='active'` = Callie approved.

```sql
profile_id PK → profiles, cal, protein, fat, carbs, notes jsonb, approved bool
```

**Payments / refunds**

- `refunds` — log: `profile_id, reason, amount_cents, stripe_refund_id, stripe_payment_intent, created_at`. No client code writes it today.
- `stripe_events` — webhook idempotency (`event_id`).
- Enrollment refund flag is `profiles.refunded` (0 live rows). `/api/refund` is **disabled** (403). `charge.refunded` only reverses **referral credit**, not `profiles.refunded`.

**Waitlists (not the Leads list)**

- `waitlist` — eligibility hold (`pregnant` / `early_nursing`).
- `cohort_waitlist` — homepage list; `cohort` text default `'cohort_2'`.

**Email / messages**

- `email_events` — send log: `profile_id` (nullable), `email_type`, `to_email`, `subject`, `resend_id`, `status` (`sent`/`failed` only), `meta`, `created_at`.
- `email_unsubscribes` — `email` PK.
- `messages` — 1:1 DMs: `client_id`, `sender_id`, `body`, `read_at`, `kind`, attachments, `deleted_at`.
- `referrals` / `referral_codes` — promo join; `referred_email` + `referred_user_id`.

Join from lead → account is **JS `lower(email)`**, not a FK.

### 2. What computes those labels (all client JS)

| Label | Meaning | Where | Rule |
|---|---|---|---|
| **Still in play / leftover** | Quiz complete, no payment | `isLeftoverLead` in `src/admin/quizLeads.js` | `funnelStatus` is `quiz_only` or `signed_up_unpaid`. Funnel: no profile → quiz only; profile unpaid → signed up unpaid; `paid`/`paid_at` → paid. Default Leads filter after #304. |
| **Needs review** | Quiz math/Callie eyes, **not** a roster queue | Written at quiz submit in `marketing/src/lib/rangesEngine.mjs`; stored on the lead | `incomplete_inputs`, `goal_maintain`/`goal_gain`, `thyroid`, `goal_bmi_under_19`, `goal_over_25pct_below_current`, `carbs_under_100`. Pregnancy segment skips review. Shown as a tag, not a chip. |
| **Need intake** | Paid, no `macros` row | `src/db/db.js` `loadAdminRoster` | `paid && !hasIntake` → `stage = paid_awaiting_intake`. Clients chip `awaiting_intake`. |
| **Need approval** | Paid + intake, not approved | same | `paid && hasIntake && !approved` → `awaiting_approval`. `approved` = `macros.approved` **or** `profiles.status === 'active'`. |

No SQL view and no API field named leftover / still-in-play / need-intake. Cron uses the same facts (`paid`, macros presence) independently.

### 3. Can we derive a single pipeline stage?

**Existing stages** (`signed_up` / `paid_awaiting_intake` / `awaiting_approval` / `active` / `refunded`) are already a pure derivation on **accounts**. Do not add a stored status for those.

The CRM stages (new lead / nudging / cold / paid-needs-setup / active / alumni) mix **leads + clients**. Derivable **if** you define a person key and accept holes:

| Proposed | Derivable from | Breaks |
|---|---|---|
| new lead | leftover + no drip sent | Retakes overwrite `created_at` on the same email. |
| nudging | leftover + remaining Track A / finish-joining | Next send is **computed**, not stored. Plant-based leftover is leftover but has **no** sales drip. |
| cold | leftover + last `email_events` older than N / unsubscribed | No last-touch column. No “Callie viewed card” event. |
| paid-needs-setup | roster `paid_awaiting_intake` + `awaiting_approval` | Comps are `paid` without Stripe (`isStripeCollected` excludes them from Paid chip). |
| active | `paid && approved && !refunded` | `profiles.week` is often stuck at 1; live week is calendar from `cohort_label`. |
| alumni | `isProgramComplete(cohort)` and/or `tier`/`subscription_status` | Alumni is a **membership gate**, not a roster stage. Missing `cohort_label` → access stays open (`program_dates_unset`). |

**Edge cases that break a naive derivation**

- **Paid without quiz:** ~48 paid profiles have no `marketing_leads` row (founding pre-quiz, different email). They never appear on Leads.
- **Quiz without account:** leftover (51-shaped). No `profiles.id`.
- **Two emails:** two people. No identity graph.
- **Manual/comp adds:** `comp=true`, may skip Stripe; still `paid`.
- **Refunds:** `profiles.refunded` exists, **0 live**. Stripe refund does **not** set it. `refunds` table is unused by app code.
- **Sticky nurture:** retake cannot leave `pregnancy_nurture` / `waitlist_plantbased`.
- **Admins:** roster forces `active` if they have approved macros.

A new `pipeline_status` column is only worth it if Callie will **override** (mark cold, snooze). Otherwise a server view over leads ⟕ profiles ⟕ last email ⟕ macros is enough. Backfill is not required for the labels you already have.

### 4. Dedup

**Email is the unique key for quiz leads.** `UNIQUE (lower(email))`. Retake **PATCHes** the same row (answers/ranges/UTMs overwrite; `created_at` is first insert — comments say “never last quiz”). Pregnancy/plant-based **stick**.

Accounts are unique on **auth user id**. Lead↔account join is `lower(email)` in `enrichQuizLeads`. Referral is a **second** email-keyed table (`referrals.referred_email`).

Quiz-then-referral: same email stays one lead; source label can stack (`Meta ad · Kristen`). Different emails = two leftover rows.

---

## Priority and queue

### 5. Existing sort (reuse this, don’t invent a second one)

**Leads:** SQL `created_at desc` only. No attention rank. Leftover filter is unpaid; no “stale / no touch” sort.

**Clients** (`filterRoster` / `attentionRank` in `src/admin/clientRoster.js`):

1. Unread mama→Callie
2. Awaiting approval
3. Quiet active (no meal/water/weigh-in yesterday or earlier; 14-day activity window)
4. Active with **never** an admin DM (`!lastAdminAt`)
5. Else oldest `lastAdminAt`, then name

Unpaid-account chip: newest `createdAt`. Active chip: A–Z. Default Clients tab is `needs_you`.

### 6. Last touched

| Signal | Exists? | What it is |
|---|---|---|
| Last email sent | Yes, queryable | `email_events.created_at` by `to_email` / `profile_id`. Not a column on the person. |
| Last in-app message | Yes | `admin_roster_message_stats().last_admin_at` = last **admin→mama** DM. Unread = mama→Callie `read_at is null`. |
| Last mama activity | Yes | `lastActiveDate` = last meal/water/weigh-in in 14 days. Not login. |
| Last admin **view** of a card | **No** | Opening Leads/Clients writes nothing. |
| Device last seen | Push only | `push_subscriptions.last_seen_at` — not CRM. |

**“No touch in 24h”** can be built from `greatest(last email, last admin DM)` for people who have those rows. Missing: Callie viewed, mailto from the phone, personal note copy. Unsubscribed is `email_unsubscribes`, not a touch.

---

## Email / drips (Resend)

### 7. Scheduling

**Hourly cron**, not per-lead jobs and **not** Resend scheduled sends. `POST /api/email-cron` (`CRON_SECRET`; GitHub Actions). Each tick:

- Track A: quiz-only, no profile — `planQuizLeadSends` / `pickDueQuizDripStep` (+2d, last, pregnancy +3d).
- Track B: unpaid **profile** — finish-joining 1h / 24h / close.
- Paid, no macros — intake reminder 24h / 72h.

Sends go through Resend immediately; a row is inserted into `email_events`.

**Next scheduled email** is already displayed on the lead card via `planLeadDrips` (`src/admin/leadDripSchedule.js`) — same rules as cron, remaining list + stop copy. Not a queue table. You can reuse that function server-side for a queue column.

### 8. Stop on pay

Reliable **if** a `profiles` row exists for that email:

- Track A: `profile` present → skip (`has_profile`); `paid`/`paid_at` → `paid`.
- Track B: cron skips `p.paid`.
- Card: `funnelStatus === 'paid'` empties remaining.

Best-effort gaps: cron racing checkout; paid on a **different email** than the quiz (those leftover rows keep Track A); welcome is best-effort on the webhook (`wasPaid` avoids double welcome).

### 9. Opens / clicks / bounces

**Not stored per person.** `email_events.status` is `sent` (1089) or `failed` (1) as of this snapshot. No Resend webhook ingest for open/click/bounce/complaint.

`quiz_signup_bounce` is a **Sentry** beacon on the signup→checkout bounce, not an email bounce.

---

## Messaging

### 10. Unread per person

Yes. `admin_roster_message_stats()` returns `client_id`, `last_admin_at`, `unread_from_mama`. Roster already names people (`unreadFromMama`). Overview badge is a **sum** of inbox unreads — the per-person breakdown already exists.

Quiz-only leftover has **no** `client_id`, so no DM unread.

### 11. Combined timeline

**No.** Emails: `email_events` (lead card + Emails tab). DMs: `messages` (Messages + client card). Different keys (`to_email` vs `client_id`). You can union in app: `created_at` + type. Nothing does that today.

---

## Payments, refunds, program state

### 12. Refunds / alumni / active

- **Pay:** Stripe Checkout → `checkout.session.completed` / async paid → `markPaid` (`paid=true`, `paid_at`, Stripe ids). Does **not** set `status=active`.
- **Enrollment refund flag:** `profiles.refunded`. Auto-refund API off. Live count **0**. `charge.refunded` → referral clawback only.
- **Alumni:** `tier`, `subscription_*` after program (Founding: free month then $49; August+: gate at `programEnd`). `membershipAccess()` — not a Clients chip.
- **Active (coach sense):** paid + approved macros + not refunded.

### 13. Week X of 8

Live week is **`programWeekNumber(cohort_label)`** from the hardcoded calendar (`programStart`). `profiles.week` is written at approve (often 1) and is **not** trusted on the roster.

Progress itself is per-event: `checkins`, `weighins`, `meal_logs`, `water_logs`, week plans — keyed by `week_start` date, not “week 3 of cohort.”

**Rolling starts break:** one `programStart` per `cohort_label`. If two people share `2026-08` but start on different Mondays, Today/Progress/voice-drop week labels collide. You’d need per-person `program_start` (or a real cohorts row + membership).

---

## Cohorts

### 14. How deep

`profiles.cohort_label` is a **text stamp** (`'2026-07'`, `'2026-08'`), not a FK. Calendar lives in `functions/_shared/cohorts.js` and `src/lib/cohorts.js` (must stay in sync). `cohort_waitlist.cohort` is a separate homepage field (`'cohort_2'`).

Stamped at pay (`handlePaidEnrollmentChannel` from `paid_at` window) or kept if already set. Founding was backfilled in migration 048.

Depends on cohort besides admin chips:

- Channel membership (`conversations.cohort_label`)
- Monday voice drops
- Membership / free month / paywall
- Pricing window (`cohortForDate` / `OPEN_COHORT_LABEL`)
- Referrals default cohort `2026-08`
- Week labels on Today / Progress / admin card

### 15. Rolling + auto-tag by paid month

Would need to change:

- `COHORT_CALENDAR` + `openEnrollmentCohort` / checkout stamp
- Channel create-on-pay (today assumes pre-seeded 2026-07 / 2026-08 rooms)
- Welcome is **generic** (no cohort in the template) — copy/scheduling only if you want “your group starts …”
- Voice drops, prompts, `adminCohortName`
- `programWeekNumber` → per-person start
- Content unlock is “approved + paid,” not week-gated by cohort — rolling hurts **labels and community**, not meal-log access

---

## Platform constraints

### 16. Admin frontend

Vite + React 19 + React Router 7. **No component library** — `Card` / `Btn` / `Shell` in `src/components/ui.jsx`, tokens `T` / `F` / `FD`. Admin is lazy-loaded `AdminPortal` (never in the customer bundle).

Nav is **`TabBar` chips** (Overview, Clients, Leads, Credits, Messages, Announcements, Emails), plus a second chip row per tab (Clients filters, Leads leftover chips, `CohortFilterBar`). No bottom nav.

### 17. Auth / Callie vs Patrick

One role: `profiles.role === 'admin'` → `isAdmin`. **No Patrick-specific dashboard.** Both admins get the same portal on `admin.macrosandmamas.com`. On **www** (customer surface) admins stay in the mama app (`homePathFor`). RLS is `is_admin()`. Do not treat `pgchammas@gmail.com` as a throwaway.

### 18. In-flight collision risk

Do not touch **299, 301, 302**. Those plus nearby open work:

| PR | Collision |
|---|---|
| **299** Ready-to-approve interrupt | Same `awaiting_approval` / Clients queue |
| **302** Split Needs you | Same `needsYou` / `attentionRank` |
| **298** Approval weekend heads-up | Email cron / C2 intake |
| **291** Quiz lead nurture overview | Leftover/nurture on Overview |
| **286** Warm Callie lead note | Lead card copy (already shipped a draft) |
| **225** parked messaging merge | Combined timeline (parked) |

#304 leftover-first Leads is **already on main**. Next CRM pass should compose with that (leftover default, cohort chips, nurture tags, no Track A next-send on plant-based), not reopen Leads-as-All.

---

## Recommendation

Keep derivation; add a **read model** (person key = `lower(email)`, plus `profile_id` when present) that exposes leftover, roster stage, last email, last admin DM, unread, next drip. Add a stored status only if Callie needs overrides. The 48 paid-without-quiz people are the first hole a unified Contacts list will hit.
