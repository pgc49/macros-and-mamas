# Macros and Mamas

Production app for [macrosandmamas.com](https://macrosandmamas.com) — an 8-week postpartum macro coaching program.

**Stack:** Vite + React SPA on Cloudflare Pages · Pages Functions (`/functions`) · Supabase Auth + Postgres (RLS) · Stripe Checkout · OpenRouter (meal photo AI)

**Flow:** take the ranges quiz (unlocks $249) → create account → pay Stripe → intake → Callie approves in admin → dashboard unlocks. Founding finish-pay ($149) still works for accounts created before the close cutoff.

## Local development

```bash
npm install
cp .env.example .env   # fill VITE_SUPABASE_* (and optional public URLs)
npm run dev            # SPA at http://localhost:5173
```

To run Pages Functions locally (checkout, webhook, estimate, analyze):

```bash
cp .dev.vars.example .dev.vars   # fill secrets — never commit .dev.vars
npx wrangler pages dev dist --compatibility-date=2024-11-01
# or: npm run build && npx wrangler pages dev dist
```

Typical loop: `npm run build` then `npx wrangler pages dev dist` so `/api/*` and the SPA share one origin.

## Deploy

| Trigger | Result |
|---------|--------|
| Push to `main` | Production deploy (Cloudflare Pages) |
| Pull request | Preview URL |

**Pages build settings**

- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: `/` (empty)
- Framework preset: none / Vite

## Environment variables

### Client build-time (Vite — set in Cloudflare Pages + local `.env`)

These are **public** (embedded in the JS bundle). Safe under RLS.

| Name | Purpose |
|------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Publishable / anon key |
| `VITE_WHATSAPP_GROUP_URL` | Optional WhatsApp invite; hides Open button if unset |
| `VITE_FULLSCRIPT_ELECTROLYTES_URL` | Optional Fullscript link |
| `VITE_FULLSCRIPT_SLEEP_URL` | Optional Fullscript link |
| `VITE_FULLSCRIPT_DIGESTION_URL` | Optional Fullscript link |

The app also has project fallbacks for Supabase URL/publishable key in `src/config.js`.

### Server runtime (Pages Functions — Cloudflare secrets / `.dev.vars`)

**Never commit real values. Never put these in client code.**

| Name | Purpose | Where |
|------|---------|--------|
| `OPENROUTER_API_KEY` | Meal photo AI | Cloudflare secret |
| `STRIPE_SECRET_KEY` | Create Checkout Sessions | Cloudflare secret (`sk_test_…` first) |
| `STRIPE_PRICE_ID_FOUNDING` | $149 founding Price ID (`price_…`) | Cloudflare env (legacy `STRIPE_PRICE_ID` still works as fallback) |
| `STRIPE_PRICE_ID_WAITLIST` / `PRICE_QUIZ_RATE` | $249 early / quiz-unlock Price ID | Cloudflare env |
| `STRIPE_PRICE_ID_FULL` / `PRICE_FULL_RATE` | $299 full Price ID | Cloudflare env |
| `STRIPE_PRICE_ID_LAB_ADDON` / `PRICE_LAB_REVIEW` | $349 Lab Review add-on Price ID | Cloudflare env |
| `PRICE_ALUMNI_49` | $49/mo Alumni Membership Price ID (stage 4; Checkout opt-in) | Cloudflare env |
| `COUPON_REFERRAL_25` | Referral $25-off coupon id (stage 2) | Cloudflare env |
| `REFERRAL_COHORT_LABEL` | Optional cohort stamp on referrals (default `2026-08`) | Cloudflare env |
| `STRIPE_BILLING_PORTAL_CONFIGURATION` | Optional Customer Portal config (`bpc_…`) | Cloudflare env |
| `VESTING_DAYS` | Credit vesting window (default `3`) — stage 1 | Cloudflare env |
| `STRIPE_WEBHOOK_SECRET` | Verify webhook signatures (`whsec_…`) | Cloudflare secret |
| `SUPABASE_URL` | Used by `/api/checkout`, `/api/analyze`, webhook | Cloudflare env |
| `SUPABASE_ANON_KEY` | Validate JWTs in functions | Cloudflare env/secret |
| `SUPABASE_SERVICE_ROLE_KEY` | Webhook marks `profiles.paid` (**server only**) | Cloudflare secret |
| `RESEND_API_KEY` | Quiz ranges email (`/api/lead`) | Cloudflare secret |
| `LEAD_FROM_EMAIL` | Optional From override for quiz email | Cloudflare env |
| `OPEN_WITHOUT_QUIZ` | `false`/unset = quiz-gated $249 (Strategy A); `true` = sell without quiz | Cloudflare env |

Local copies live in `.dev.vars` (gitignored). See `.dev.vars.example`.

## Supabase setup

1. Create a project; run `/supabase/schema.sql` in the SQL editor.
2. Auth → URL configuration: Site URL + redirect URLs for production, `*.pages.dev` previews, and `http://localhost:5173`.
3. After Callie signs in once, promote her:

```sql
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'CALLIE_EMAIL_HERE');
```

## Stripe setup (test mode first)

1. Use **Price IDs** (never amounts) — live inventory and stage-0 notes: `docs/STAGE-0-STRIPE-FOUNDATION.md`. Credits: `docs/STAGE-1-CREDITS.md`. Referrals: `docs/STAGE-2-REFERRALS.md`.
2. Webhook endpoint: `https://YOUR_DOMAIN/api/stripe-webhook`  
   Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted` → copy signing secret (`whsec_…`). Idempotency table: `stripe_events`.
3. Set in Cloudflare: `STRIPE_SECRET_KEY`, price ids (`STRIPE_PRICE_ID_*` and/or `PRICE_*` aliases), `STRIPE_WEBHOOK_SECRET`. Optional: `STRIPE_BILLING_PORTAL_CONFIGURATION`, `PRICE_ALUMNI_49`, `COUPON_REFERRAL_25`.
4. Checkout picks the tier automatically (`functions/_shared/pricing.js`):
   - Account created before `ENROLLMENT_CLOSED_AT` → founding $149  
   - Email has an eligible `marketing_leads` row (quiz unlock) → early $249  
   - Else → full $299 (set `OPEN_WITHOUT_QUIZ=true` only to sell $249 without the quiz)  
5. Customer Portal: Dashboard → enable card update + invoice history; **disable** cancel + plan switch. Payments → **Open billing portal**.
6. Before real charges: switch to live keys, live prices, and a live webhook.
7. See `docs/ENROLLMENT-OPEN.md` and `docs/WWW-CUTOVER.md` for www marketing cutover.
8. See `docs/GOOGLE-SETUP.md` and `docs/META-SETUP.md` for analytics / ads tags (you paste IDs; code is already wired).

## App URLs

| URL | Who | Role |
|-----|-----|------|
| `/` | Public | Sales / marketing |
| `/terms` | Public | Terms and Conditions |
| `/signin` | Public | Create account / sign in (create requires Terms checkbox) |
| `/join` | Signed-in, unpaid | Stripe checkout CTA |
| `/welcome` | After Stripe success | Polls until webhook sets `paid`, then intake |
| `/onboarding` | Paid (or admin) | Intake form |
| `/pending` | Paid + intake done | Awaiting Callie approval |
| `/goodbye` | Refunded after eligibility decline | Warm exit; no app access |
| `/dashboard` | Approved + paid (admins too) | Client app — ranges, meals, progress |
| `/support` | Signed-in clients | Tech help form → private GitHub issue (Tech Guy). WhatsApp link prompts sign-in. |
| `/admin` | `profiles.role = admin` only | Overview (signups/paid), clients, email templates + per-mama send log |

Admins land on `/admin` after sign-in, and can open **My dashboard** (`/dashboard`) to dogfood the product. Non-admins hitting `/admin` are redirected away.

## Key paths

| Path | Role |
|------|------|
| `/spec/macros-and-mamas.jsx` | Approved product spec (reference; do not “improve” copy) |
| `/functions/api/estimate.js` | Meal photo + text → OpenRouter (JWT required) |
| `/functions/api/analyze.js` | Legacy photo-only endpoint (JWT required) |
| `/functions/api/checkout.js` | Stripe Checkout Session (pay-first) |
| `/functions/api/stripe-webhook.js` | Marks profile paid + stores Stripe ids + welcome email |
| `/functions/api/refund.js` | Full eligibility refund + refund email |
| `/functions/api/intake-submitted.js` | Intake received email + Callie notify |
| `/functions/api/macros-approved.js` | Approve + macros-live email |
| `/functions/api/support.js` | Mama/coach tech report → GitHub issue (email fallback) |
| `/functions/api/support-digest-cron.js` | Daily AI triage of `from-app` issues; emails OWNER **only** when a change plan needs approval |
| `.github/workflows/support-digest-cron.yml` | Schedules triage (~13:30 UTC); needs Actions `CRON_SECRET` |
| `/supabase/functions/` | Resend Edge Functions (deploy via Supabase CLI) |
| `/supabase/migrations/021_support_reports.sql` | `support_reports` + private `support-screenshots` bucket |
| `/supabase/schema.sql` | Tables + RLS |
| `/supabase/migrations/002_meal_logging.sql` | `meal_logs.source` + `estimate_calls` |
| `/supabase/migrations/003_terms_accepted.sql` | `profiles.terms_accepted_at` + signup trigger |
| `/supabase/migrations/004_intake_step2.sql` | `waitlist` table + `profiles.season_note` |
| `/supabase/migrations/005_pay_first.sql` | Stripe ids, `refunded`, refunds log, payment column protection |
| `/supabase/migrations/011_client_meal_plans.sql` | Per-client meal plan draft + publish switch (`default` / `personalized`) |
| `/supabase/migrations/012_water_log.sql` | `water_logs` table + `profiles.bottle_oz` for Today water log |
| `/supabase/migrations/013_custom_meals.sql` | Saved “My meals” (name + macros) for one-tap re-logging |
| `/src` | Production React app |

**After deploy:** run pending migrations in the Supabase SQL editor if not already applied:
- `002_meal_logging.sql` — `meal_logs.source` + `estimate_calls`
- `003_terms_accepted.sql` — Terms acceptance timestamp + signup trigger metadata copy
- `004_intake_step2.sql` — waitlist + season note for intake redesign
- `005_pay_first.sql` — **required for pay-first** (Stripe fields, refunds, protect `paid`)
- `006_email_events.sql` — **required for admin email history** (admin-only `email_events`)
- `011_client_meal_plans.sql` — **required for publishing personalized meal plans** to client Meals
- `012_water_log.sql` — **required for water log** (`water_logs` + `bottle_oz`)
- `013_custom_meals.sql` — **required for My meals** (saved custom meals for one-tap logging)
- `021_support_reports.sql` — **required for `/support`** (rate limit log + private screenshot bucket)
- `054_alumni_membership.sql` — **required for monthly membership** (subscription fields on `profiles`)

### Support → GitHub (WhatsApp link)

1. Run `021_support_reports.sql` in the Supabase SQL editor.
2. Create a **fine-grained GitHub PAT**: Settings → Developer settings → Fine-grained tokens → only `pgc49/macros-and-mamas`, permission **Issues: Read and write**. Nothing else.
3. Cloudflare Pages → Environment variables (Production + Preview): `GITHUB_TOKEN` = that PAT (secret). Optional `GITHUB_REPO=pgc49/macros-and-mamas`.
4. Redeploy Supabase Edge Function `notify-callie` (adds `type: support` email fallback to owner only).
5. WhatsApp link for mamas: `https://www.macrosandmamas.com/support`  
   (They must sign in — reports are tied to their account. Public visitors cannot submit.)
6. Install GitHub mobile app; watch the repo for Issues. Triage yourself — only `@cursor` on real bugs. Never auto-trigger agents from form text.
7. Also run `022_support_auth_media.sql` (signed-in uploads + screen recordings up to 50 MB).
8. After adding `GITHUB_TOKEN`, trigger a new Pages deploy (env secrets only apply on the next build).
9. Redeploy `notify-callie` from a branch that includes `type: "support"` (`git pull` first).

## Definition of done (checklist)

- [ ] Push to `main` deploys; PRs get preview URLs
- [ ] Visitor creates account → pays → completes intake → pending; gated applicants get refund + decline copy
- [ ] Callie (admin) sees pending queue, edits macros, approves
- [ ] Approved + paid client sees ranges, checklist, weigh-in, meal log via `/api/estimate`
- [ ] Unauthenticated `curl` to `/api/estimate` returns **401**; unpaid returns **403**
- [ ] Reload / second browser shows the same persisted data
- [ ] No secret key material in git (`sk-or-`, `sk_live`, `sk_test` values, etc.)
