# Macros and Mamas — marketing site (Astro)

Static Astro homepage + `/waitlist` for SEO and ads. Separate from the logged-in React SPA.

## Commands

```bash
npm install
PUBLIC_ENROLLMENT_MODE=open npm run build       # default
PUBLIC_ENROLLMENT_MODE=waitlist npm run build
PUBLIC_NOINDEX=true npm run build               # staging / *.pages.dev
npm run preview
```

## Enrollment mode

`PUBLIC_ENROLLMENT_MODE` = `waitlist` | `open` (default `open`). Build-time only.

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

Astro must **not** reuse the product SPA Pages project (`macros-and-mamas`).
That project builds the Vite app from the **repo root**. Astro needs its own
Pages project with root directory `marketing/` so:

1. `npm install` / `npm run build` run inside `marketing/`
2. Publish directory is `marketing/dist` (static HTML + `_astro/` assets)
3. `marketing/functions/` is picked up as Pages Functions (`POST /api/waitlist`)

### Create the Pages project (dashboard)

Workers & Pages → Create → Pages → Connect to Git → `pgc49/macros-and-mamas`:

| Setting | Value |
| --- | --- |
| Project name | `macrosandmamas-marketing` (or similar) |
| Production branch | leave unused / protected — do **not** point `www` here yet |
| Root directory | `marketing` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Framework preset | None (or Astro if offered; static output is fine) |

**Build environment variables** (Preview + Production):

- `PUBLIC_ENROLLMENT_MODE` = `open`
- `PUBLIC_NOINDEX` = `true`

**Runtime secrets** (Settings → Environment variables):

- `SUPABASE_URL` (or `VITE_SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY` (preferred) or anon key
- Optional: `META_PIXEL_ID`, `META_CAPI_ACCESS_TOKEN`

Do **not** attach a custom domain until cutover review. Share the
`*.pages.dev` preview URL with Callie.

### Why not `@astrojs/cloudflare` yet

This site is **static** HTML plus classic **Pages Functions** under
`functions/`. The Cloudflare adapter targets Workers/SSR and previously
emitted a reserved `ASSETS` binding that broke the build. Revisit the
adapter only if we need on-demand rendering at www cutover.

### PR preview on the SPA project (temporary)

The product Pages build on branch `cursor/full-marketing-execution*` runs
`scripts/maybe-preview-marketing.mjs`, which overlays `marketing/dist` onto
the SPA `dist/` **for that branch only**. Production/`main` skips it.
That overlay is for a quick visual URL; waitlist API and proper Astro
asset hosting still belong on the separate Pages project above.

See `../docs/META-SETUP.md` for Pixel / CAPI secrets.
