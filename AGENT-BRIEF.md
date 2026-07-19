# AGENT-BRIEF.md — Macros and Mamas build instructions

You are building the production app for macrosandmamas.com, an 8-week postpartum
macro coaching program run by a single coach (Callie). Two source files are in
this repo and they are your complete spec:

- `/spec/macros-and-mamas.jsx` — the full product: client app, intake flow,
  gating rules, macro engine, admin portal, and all approved copy. Every seam
  you must wire is marked `PROD-TODO` with a `{{PLACEHOLDER}}` token.
- `/functions/api/analyze.js` — a working Cloudflare Pages Function for the
  meal-photo feature. It is already written for OpenRouter. Do not rewrite it;
  just keep it at this exact path so Pages auto-deploys it.

## Stack (do not substitute)

- Vite + React SPA, deployed on Cloudflare Pages
- Cloudflare Pages Functions (the `/functions` directory) for all server code
- Supabase for auth and data (Postgres with row-level security)
- Stripe for payment (one product, $149 founding price)
- OpenRouter for ALL AI API calls. Model: `google/gemini-3.1-flash-lite`,
  defined as a single constant in analyze.js. Never call any AI provider
  directly; everything routes through https://openrouter.ai/api/v1.

## Hard rules

1. NEVER commit secrets. `OPENROUTER_API_KEY`, Stripe secret key, and the
   Supabase service-role key exist only as Cloudflare/Supabase environment
   secrets. If you need a secret to exist, add it to `.dev.vars.example` with
   a placeholder value, add `.dev.vars` to `.gitignore`, and note it in the
   README for the human to set. The Supabase URL and anon key may live in
   client code (they are public by design under RLS).
2. PRESERVE VERBATIM everything the spec marks as approved: the
   `computeMacros()` formula including floors, caps, and note strings; the
   intake gating rules in `submitIntake()`; all sales, intake, decline,
   pending, and app copy; the 21 recipes and meal skeletons; the RangeBand
   design; the 1.5 lb/wk guardrail messaging. Do not "improve" copy.
3. The intake gates run BEFORE payment. Flow: intake -> Callie approves in the
   admin portal -> client pays via Stripe -> dashboard unlocks. Declined
   applicants (pregnant, <6mo postpartum breastfeeding, vegetarian/vegan)
   never reach checkout, so no refunds are ever needed.
4. Do not port the prototype's save-everything-as-one-blob persistence
   pattern. Write per-event: a checklist toggle writes a checkins row, a
   weigh-in writes a weighins row, a logged meal writes a meal_logs row.
   Delete the marker save-effect in the spec once per-event writes exist.
5. `/api/analyze` must require a valid Supabase JWT (verify the access token
   from the Authorization header) before calling OpenRouter, and the client
   must send it. The endpoint must not be callable anonymously in production.

## Build order

1. Scaffold Vite + React in the repo root. Move the spec file to
   `/spec/macros-and-mamas.jsx` (reference), and build the real app in `/src`
   against it. Keep `/functions/api/analyze.js` in place.
2. Supabase schema + RLS. Tables:
   - `profiles` (id -> auth.users, name, age, phone, current_weight,
     goal_weight, months_pp, breastfeeding, pregnant, goal, activity, stress,
     insulin_resistance, diet, pref_b, pref_l, pref_d, role default 'client',
     status default 'pending')
   - `macros` (profile_id, cal, protein, fat, carbs, notes jsonb,
     approved boolean default false)
   - `checkins` (profile_id, week_start date, item_id text, day text)
   - `weighins` (profile_id, date, weight)
   - `meal_logs` (profile_id, date, name, cal, p, c, f)
   RLS: clients read/write only their own rows; `role = 'admin'` (Callie)
   reads and writes all rows. Write the SQL to `/supabase/schema.sql`.
3. Auth: Supabase email magic-link. Replace the `useAuth()` stub. Admin
   portal renders only for `role = 'admin'`, enforced by RLS server-side too.
4. Wire the `db` object in the spec to real Supabase queries, per-event as
   above. Callie's admin edits to macros persist via `updateClientMacros`;
   `approveClient` sets approved=true and status='active'.
5. Stripe: Checkout Session created by a Pages Function at
   `/functions/api/checkout.js`, plus a webhook at
   `/functions/api/stripe-webhook.js` that verifies the signature and marks
   the profile paid. Payment link is sent/shown only after Callie approves.
   Secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (human sets them).
6. Fill remaining `{{PLACEHOLDER}}` tokens from environment/config:
   WhatsApp group URL and the three Fullscript links stay as env-driven
   config the human fills; hide the buttons gracefully if unset.
7. README with local dev instructions (`npm run dev` + `wrangler pages dev`
   for functions) and the full list of secrets the human must set.

## What the human does (not you)

- Created this repo and connected it to Cloudflare Pages (build: `npm run
  build`, output: `dist`), and attached macrosandmamas.com in the Pages
  project's Custom Domains tab.
- Sets all secrets in the Cloudflare dashboard: OPENROUTER_API_KEY,
  STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and Supabase service-role key if
  any function needs it.
- Creates the Supabase project and runs your `/supabase/schema.sql`.
- Creates the Stripe product and webhook endpoint, tests with Stripe test mode.
- Acts as user zero: Callie runs the real intake, approves herself in the
  admin portal, and tests the full loop before any founding mama pays.

## Definition of done

- Push to main deploys to Cloudflare Pages; PRs get preview URLs.
- A new visitor can: view the sales page, complete intake, land in pending.
- Callie can: sign in, see the pending queue, edit macro numbers, approve.
- An approved client can: pay in Stripe test mode, sign in, see her ranges,
  check off her week, log a weigh-in, snap a plate photo and get a macro
  estimate back through /api/analyze.
- No secrets in git history. `git log -p | grep -i "sk-\|sk_live\|service_role"`
  returns nothing.
