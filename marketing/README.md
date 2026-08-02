# Macros and Mamas — marketing site (Astro)

Static Astro homepage + `/waitlist` for SEO and ads. Separate from the logged-in React SPA.

## Commands

```bash
npm install
PUBLIC_ENROLLMENT_MODE=waitlist npm run build   # default
PUBLIC_ENROLLMENT_MODE=open npm run build
PUBLIC_NOINDEX=true npm run build               # staging / *.pages.dev
npm run preview
```

## Enrollment mode

`PUBLIC_ENROLLMENT_MODE` = `waitlist` | `open` (default `waitlist`). Build-time only.

Dates/prices: `src/config.ts`.

## Member / PWA safety

- Homepage includes a sync `<head>` guard: standalone display-mode / iOS standalone **or** Supabase auth token in `localStorage` → `/dashboard`.
- Product SPA manifest `start_url` is `/dashboard` (repo root `public/site.webmanifest`).
- Push notification clicks already open `/dashboard?tab=messages`.

## Waitlist

`POST /api/waitlist` → Supabase `cohort_waitlist` (same table as the SPA).  
Requires `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (or anon) on the Pages project.  
Optional: Meta CAPI Lead via `META_PIXEL_ID` + `META_CAPI_ACCESS_TOKEN`.

## Staging (zero www impact)

Deploy this folder as a **separate** Cloudflare Pages project:

- Root directory: `marketing`
- Build: `npm run build`
- Output: `dist`
- Env: `PUBLIC_ENROLLMENT_MODE=waitlist`, `PUBLIC_NOINDEX=true`
- Do **not** attach `www` until cutover review

See `../docs/META-SETUP.md` for Pixel / CAPI secrets.
