# Macros and Mamas

Production app for [macrosandmamas.com](https://macrosandmamas.com) — an 8-week postpartum macro coaching program.

**Stack:** Vite + React SPA on Cloudflare Pages · Pages Functions (`/functions`) · Supabase Auth + Postgres (RLS) · Stripe Checkout · OpenRouter (meal photo AI)

**Flow:** create account → pay $149 (Stripe) → intake → Callie approves in admin → dashboard unlocks.

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
| `STRIPE_PRICE_ID` | $149 Price ID (`price_…`) | Cloudflare env |
| `STRIPE_WEBHOOK_SECRET` | Verify webhook signatures (`whsec_…`) | Cloudflare secret |
| `SUPABASE_URL` | Used by `/api/checkout`, `/api/analyze`, webhook | Cloudflare env |
| `SUPABASE_ANON_KEY` | Validate JWTs in functions | Cloudflare env/secret |
| `SUPABASE_SERVICE_ROLE_KEY` | Webhook marks `profiles.paid` (**server only**) | Cloudflare secret |

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

1. Create a one-time **$149** product → copy **Price ID** (`price_…`).
2. Webhook endpoint: `https://YOUR_DOMAIN/api/stripe-webhook`  
   Event: `checkout.session.completed` → copy signing secret (`whsec_…`).
3. Set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` in Cloudflare.
4. Before real charges: switch to live keys, live price, and a live webhook.

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
| `/supabase/functions/` | Resend Edge Functions (deploy via Supabase CLI) |
| `/supabase/schema.sql` | Tables + RLS |
| `/supabase/migrations/002_meal_logging.sql` | `meal_logs.source` + `estimate_calls` |
| `/supabase/migrations/003_terms_accepted.sql` | `profiles.terms_accepted_at` + signup trigger |
| `/supabase/migrations/004_intake_step2.sql` | `waitlist` table + `profiles.season_note` |
| `/supabase/migrations/005_pay_first.sql` | Stripe ids, `refunded`, refunds log, payment column protection |
| `/src` | Production React app |

**After deploy:** run pending migrations in the Supabase SQL editor if not already applied:
- `002_meal_logging.sql` — `meal_logs.source` + `estimate_calls`
- `003_terms_accepted.sql` — Terms acceptance timestamp + signup trigger metadata copy
- `004_intake_step2.sql` — waitlist + season note for intake redesign
- `005_pay_first.sql` — **required for pay-first** (Stripe fields, refunds, protect `paid`)
- `006_email_events.sql` — **required for admin email history** (admin-only `email_events`)

## Definition of done (checklist)

- [ ] Push to `main` deploys; PRs get preview URLs
- [ ] Visitor creates account → pays → completes intake → pending; gated applicants get refund + decline copy
- [ ] Callie (admin) sees pending queue, edits macros, approves
- [ ] Approved + paid client sees ranges, checklist, weigh-in, meal log via `/api/estimate`
- [ ] Unauthenticated `curl` to `/api/estimate` returns **401**; unpaid returns **403**
- [ ] Reload / second browser shows the same persisted data
- [ ] No secret key material in git (`sk-or-`, `sk_live`, `sk_test` values, etc.)
