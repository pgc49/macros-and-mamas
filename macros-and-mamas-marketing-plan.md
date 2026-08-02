# Macros and Mamas — Marketing & Attribution Plan

**For:** Patrick  
**Stack fact:** Vite + React SPA on Cloudflare Pages + Pages Functions (not Next/Astro today)  
**Date:** August 2026

---

## Direct answer: should the homepage become Astro?

**Yes — but not first.**

| When | Homepage |
|------|----------|
| **Phase 1 (now)** | Keep the current React [`SalesPage`](src/views/SalesPage.jsx) at `/`. Add Meta Pixel + UTMs + CAPI. Ads can already point here / to `/waitlist`. |
| **Phase 2 (next)** | **Convert `/` (and `/waitlist`) to Astro or equivalent static HTML** so Google and crawlers see real copy in the HTML. Keep the coaching app as the Vite SPA (`/dashboard`, `/join`, `/onboarding`, etc.). |
| **Not recommended** | Claude’s “separate Astro repo + new Embedded Checkout + leave homepage forever on SPA” as the main plan. |

**Why Astro for homepage eventually:** legitimate SEO and cleaner ad landers need HTML that doesn’t depend on React boot. Astro is a good fit on Cloudflare Pages. It does **not** need to own checkout — CTAs still go to existing waitlist / sign-in / Stripe flow.

**Why not Astro first:** Facebook ads fail today because of **missing attribution**, not because the homepage isn’t Astro. Fix measurement first, then make `/` indexable.

---

## Your understanding (confirmed)

- App is JavaScript (React SPA).
- Homepage body is hard for Google to index reliably (shell + “Loading…”).
- No Meta Pixel / CAPI / UTM pipeline → paid marketing attribution is blind.
- Funnel already exists: `/` → `/waitlist` → (when open) account → `/api/checkout` → intake → Callie approve → app.
- Enrollment is currently **closed**; waitlist + $249 tier already exist.

---

## What Claude got right

- SPA SEO problem is real.
- Browser Pixel **+** Conversions API with shared `event_id` dedupe is correct.
- Stripe on Workers needs `constructEventAsync`.
- Additive Supabase only; don’t break ~42 installed PWAs.
- Staging / `noindex` hygiene is good.

## What Claude got wrong (do not follow)

| Claude said | Reality | Better call |
|-------------|---------|-------------|
| Service worker will hijack `/join` | SW is push/badge only — no HTML fallback | No SW Phase 4/5 drama needed for path routing |
| New Embedded Checkout + new Product/webhook | Checkout + tiers already exist | Extend existing Stripe path |
| New `marketing_leads` table | `cohort_waitlist` already exists | Extend that table with UTM / fbp / fbc / event_id |
| Separate Astro repo is mandatory | Same Pages project hosts marketing + app | Same repo is fine; separate repo optional |
| Quiz + guest checkout in Phase 1 | Product is account-first | Defer quiz; never parallel guest checkout |
| Permanent `go.` subdomain | OK for experiments | Prefer apex HTML long-term for SEO |
| Root swap soon | iOS home-screen icons stick to old URL | Defer for months |

---

## Recommended order

**Measurement → conversion landers → SEO.**  
Claude inverted this (big Astro site + quiz + new Stripe before Pixel).

### Phase 1 — Attribution on the existing app (do this first)

Same Cloudflare Pages project. No DNS change. No second Stripe stack.

1. Meta Pixel on **public** routes only (`/`, `/waitlist`, `/signin`, `/join`, `/welcome`, legal) — not inside the logged-in coaching app.
2. Capture `utm_*`, `fbclid`, `_fbp`, `_fbc` → `sessionStorage` + `cohort_waitlist` columns (additive migration).
3. Events:
   - **Lead** on waitlist success (browser + CAPI), same `event_id`
   - **InitiateCheckout** when `/api/checkout` creates a session
   - **Purchase** from existing Stripe webhook + thank-you page pixel, same `event_id`
4. Hash email/name for Event Match Quality; send IP + user agent on CAPI.
5. Idempotent Purchase (unique Stripe session id) so retries don’t inflate CAC.
6. Verify in Meta Test Events / Events Manager **before** spending.

**Homepage in Phase 1:** stays React. Ads can still run.

### Phase 2 — Homepage becomes indexable HTML (Astro or equivalent)

**Yes: convert homepage (and waitlist) to Astro/static HTML.**

- `/` and `/waitlist` → real HTML (Astro preferred on Cloudflare Pages)
- App stays Vite SPA: `/dashboard`, `/join`, `/onboarding`, `/pending`, `/admin`, etc.
- Same domain (`www`) preferred; `go.` only if you want a hard experiment sandbox
- Do **not** rebuild checkout in Astro
- Add `robots.txt`, `sitemap.xml`, per-page title / description / canonical / OG

**Homepage after Phase 2:** Astro marketing page. React `SalesPage` retired or unused for `/`.

### Phase 3 — Optional macro quiz lead magnet

Only after Phase 1 works:

- Quiz can be Astro + client JS
- Math must match `computeMacros.js`
- Result → email → **same** `cohort_waitlist`
- Still no second checkout

---

## Explicitly reject / defer

- Parallel Embedded Checkout + second webhook as source of truth
- New live Stripe Product before using existing price tiers
- Service-worker kill switch / root swap project
- Subdomain-forever as the SEO end state
- Shipping a large quiz site before Pixel/CAPI

---

## Success criteria

- Meta shows **Lead** (now) and **Purchase** (when enrollment opens), deduped, usable EMQ
- Ad click → UTMs / fbclid land on waitlist row (and later checkout metadata)
- Google can View Source real text on `/` and `/waitlist` (not only Loading…)
- Home-screen members still open the app with no auth/checkout regression

---

## Homepage decision (one line)

**If not spending on Meta yet:** Astro/indexable homepage can go first (Phase 2), with the member guard below.  
**Pixel/CAPI:** still required before the first Meta dollar — can come after Astro.

---

## Pinned home screen + push notifications (must-factor)

### How pins work today

- Manifest [`site.webmanifest`](public/site.webmanifest): **`start_url` is `/`**, not `/dashboard`.
- So “Add to Home Screen” icons open **`/`** (today: React sales shell, then paid users get redirected into the app after auth loads).
- They are **not** already pinned to `/dashboard`.

### How push works today

- Service worker [`public/sw.js`](public/sw.js): push + badge only (no HTML cache / no navigation hijack).
- Notification tap opens **`/dashboard?tab=messages`** directly — independent of `start_url`.
- Push only registers in **standalone** (home-screen) mode ([`src/lib/push.js`](src/lib/push.js)).

### Does Astro on `/` break pins or push?

| Concern | Impact if done carefully |
|---------|---------------------------|
| Existing pins | Still open `/`. Safe **only if** Astro `/` immediately redirects standalone (and/or logged-in) users into `/dashboard` (or app entry). Without that guard, moms would see the marketing site. |
| Push delivery | Unaffected — SW stays at `/sw.js`, scope `/`. |
| Notification tap | Unaffected — still opens `/dashboard?tab=messages` (SPA). |
| Future pins | Update manifest `start_url` to `/dashboard` so **new** installs open the app directly. Old iOS pins often keep the old `/` until they remove + re-add. |

### Optional: ask moms to re-pin from `/dashboard`

User base is small enough that a short Messages/email note works:

1. Open the app (or open `macrosandmamas.com/dashboard` in Safari).
2. Remove the old home-screen icon.
3. Share → Add to Home Screen again (while on `/dashboard`).

That makes their icon open the app directly. Nice-to-have after you change `start_url`; **not required** if the `/` standalone redirect is solid.

### Safe cutover checklist

1. Preview Astro with zero `www` traffic.
2. Ship `/waitlist` as Astro first (not `start_url`).
3. Ship Astro `/` **with** sync standalone/session → `/dashboard` redirect.
4. Keep SPA at `/dashboard`, `/join`, `/onboarding`, etc.
5. Keep `/sw.js` unchanged in behavior (push + badge).
6. Change manifest `start_url` → `/dashboard` for new installs.
7. Optional: tell cohort to re-pin from `/dashboard`.
