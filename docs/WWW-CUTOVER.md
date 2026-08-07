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
| `/dashboard`, `/join`, `/signin`, `/admin`, … | SPA shell → `/app.html` (`/* /app.html 200`) |
| `/api/lead`, `/api/waitlist` | Copied marketing Functions |
| `/api/checkout`, webhooks, … | Existing SPA Functions |
| Homescreen icon | `/dashboard` on `www` (unchanged) |

Static files win over the splat rewrite, so the marketing homepage is not replaced by the SPA shell.

## What the build does (`main`)

`npm run build` → Vite SPA → `scripts/maybe-preview-marketing.mjs` when `CF_PAGES_BRANCH=main`:

1. Build `marketing/` (enrollment mode from `marketing/wrangler.toml`; **no** `PUBLIC_NOINDEX`)
2. Rename `dist/index.html` → `dist/app.html` (SPA shell)
3. Overlay `marketing/dist` (Astro `index.html`, quiz, assets)
4. Copy `lead.ts` / `waitlist.ts` / `rangesEngine.mjs` into `functions/`
5. Write `_redirects`: apex→www + `/* /app.html 200`

## SPA project secrets (required for quiz email)

On **`macros-and-mamas`** Production (and Preview if you test quiz there):

| Var | Why |
| --- | --- |
| `SUPABASE_URL` / already present | Shared |
| `SUPABASE_SERVICE_ROLE_KEY` | `marketing_leads` + waitlist upserts |
| `RESEND_API_KEY` | Ranges delivery email |
| `LEAD_FROM_EMAIL` | Optional From override |

Plaintext enrollment mode stays in `marketing/wrangler.toml` (`waitlist` \| `open`).

## Smoke checklist (after `main` deploy)

Do these **before** sending paid traffic:

1. **Homescreen** — tap icon → dashboard, still signed in (no reinstall).
2. **Cold `/`** — `https://www.macrosandmamas.com/` → Astro marketing (quiz CTA), not SPA loader.
3. **`/dashboard`** — SPA app shell loads.
4. **`/join`** — SPA join still works.
5. **`/quiz`** — complete submit → email + `marketing_leads` row.
6. **Sign in** — existing members OK.
7. **View source on `/`** — Astro HTML (Marcellus / `_astro/`), not `Couldn’t load the app`.

## Rollback

1. Cloudflare → `macros-and-mamas` → Deployments → promote the previous Production deployment (pre-cutover commit).
2. Or revert the cutover PR on `main` and redeploy.

Do **not** attach `www` to `macrosandmamas-marketing` as a “fix.”

## Local verify

```bash
MARKETING_WWW_CUTOVER=1 npm run build
test -f dist/app.html && test -f dist/index.html && test -f dist/quiz/index.html
grep app.html dist/_redirects
test -f functions/api/lead.ts
```
