# www marketing cutover (Option C)

Serve the Astro marketing site on `www.macrosandmamas.com` **without** moving the custom domain off the SPA Pages project. Homescreen / PWA users keep the same origin and `/dashboard` start URL.

## Architecture

| Project | Domain | Role after cutover |
| --- | --- | --- |
| **`macros-and-mamas`** (SPA) | `www` + apex | **Lives here.** Build overlays Astro onto `dist/`, keeps SPA shell as `/app.html` |
| **`macrosandmamas-marketing`** | `*.pages.dev` only | Staging / preview of marketing alone — do **not** attach `www` |

### Request routing (SPA project)

| Path | Serves |
| --- | --- |
| `/`, `/quiz`, `/waitlist`, `/thanks`, `/_astro/*` | Astro static files from overlay |
| `/dashboard`, `/join`, `/signin`, `/admin`, … | SPA shell → `/spa/index.html` (**per-route rewrites only**) |
| `/api/lead`, `/api/waitlist` | Copied marketing Functions (KV rate-limited when `WAITLIST` binding is set) |
| `/api/checkout`, webhooks, … | Existing SPA Functions |
| Unknown paths | Astro `404.html` (not the homepage) |
| Homescreen icon | `/dashboard` on `www` (unchanged) |

**Do not** use `/* → /app.html` or a catch-all SPA rewrite — Cloudflare’s HTML pretty-URLs caused a `/` → `/app` redirect loop in production. Keep explicit SPA paths in `_redirects`.

## What the build does (`main`)

`npm run build` → Vite SPA → `scripts/maybe-preview-marketing.mjs` when `CF_PAGES_BRANCH=main`:

1. Build `marketing/` (enrollment mode from `marketing/wrangler.toml`; **no** `PUBLIC_NOINDEX`)
2. Move SPA `dist/index.html` → `dist/spa/index.html`
3. Overlay `marketing/dist` (Astro `index.html`, quiz, assets)
4. Copy `lead.ts` / `waitlist.ts` / `rangesEngine.mjs` into `functions/`
5. Write `_redirects`: apex→www + explicit SPA route → `/spa/index.html` rewrites

## SPA project secrets (required for quiz email)

On **`macros-and-mamas`** Production (and Preview if you test quiz there):

| Var | Why |
| --- | --- |
| `SUPABASE_URL` / already present | Shared |
| `SUPABASE_SERVICE_ROLE_KEY` | `marketing_leads` + waitlist upserts |
| `RESEND_API_KEY` | Ranges delivery email |
| `LEAD_FROM_EMAIL` | Optional From override |

Plaintext enrollment mode stays in `marketing/wrangler.toml` (`waitlist` \| `open`).

## Before you merge / deploy

On Cloudflare → **`macros-and-mamas`** (SPA) → Settings → Variables:

- [ ] `RESEND_API_KEY` present (Production) — required for quiz email on www
- [ ] `SUPABASE_SERVICE_ROLE_KEY` present — usually already there for webhooks
- [ ] Optional: `LEAD_FROM_EMAIL`

`macrosandmamas-marketing` can stay as staging; no domain change.

## Canonical host

**Always use `https://www.macrosandmamas.com` in ads and links.**  
`functions/_middleware.js` 301s apex → www and preserves query strings (`fbclid`, UTMs).

## After every cutover-related deploy

1. **Purge Cloudflare cache** for `/spa`, `/spa/`, `/spa/*`, `/app*` (stale shells cause blank app loads).
2. Confirm Production secrets: `RESEND_API_KEY`, `STRIPE_PRICE_ID_LAB_ADDON`, `SUPABASE_SERVICE_ROLE_KEY`.
3. Strategy A: keep `OPEN_WITHOUT_QUIZ` unset/`false` so $249 requires the quiz; homepage shows full rate $299.
4. Smoke: `curl -sI "https://macrosandmamas.com/quiz?fbclid=test"` → `301` to `www` with `fbclid` intact.

## Smoke checklist (after `main` deploy)

Do these **before** sending paid traffic:

1. **Homescreen** — tap icon → dashboard, still signed in (no reinstall).
2. **Cold `/`** — `https://www.macrosandmamas.com/` → Astro marketing (quiz CTA), not SPA loader.
3. **`/dashboard`** — SPA app shell loads.
4. **`/join`** without quiz email → unlock CTA (`quiz_required`). After quiz → $249 + cohort date.
5. **`/quiz`** — complete submit → ranges / Pre-pay offer + email + `marketing_leads` row.
6. **`/nope`** — real 404 page, not the homepage.
7. **Sign in** — existing members OK.
8. **View source on `/`** — Astro HTML (Marcellus / `_astro/`), not `Couldn’t load the app`.
9. **Footer Instagram** — links to `https://www.instagram.com/nourishwithcalista`.

## Rollback

1. Cloudflare → `macros-and-mamas` → Deployments → promote the previous Production deployment (pre-cutover commit).
2. Or revert the cutover PR on `main` and redeploy.

Do **not** attach `www` to `macrosandmamas-marketing` as a “fix.”

## Local verify

```bash
MARKETING_WWW_CUTOVER=1 npm run build
test -f dist/spa/index.html && test -f dist/index.html && test -f dist/quiz/index.html
! test -f dist/app.html
grep '/spa/index.html' dist/_redirects
test -f functions/api/lead.ts
```
