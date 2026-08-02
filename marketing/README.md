# Macros and Mamas — marketing site

Static Astro homepage for `macrosandmamas.com`. Separate from the logged-in React SPA.

## Commands

```bash
npm install
PUBLIC_ENROLLMENT_MODE=waitlist npm run build   # default
PUBLIC_ENROLLMENT_MODE=open npm run build
npm run dev
```

## Enrollment mode

`PUBLIC_ENROLLMENT_MODE` is `waitlist` or `open` (default `waitlist`). Exactly one mode is rendered at build time. There is no client-side preview toggle.

Dates and prices live in `src/config.ts`.

## Waitlist API

`functions/api/waitlist.ts` is a Cloudflare Pages Function:

- Validates email, honeypot (`company`), basic IP rate limit via KV (`WAITLIST` binding)
- Redirects to `/thanks` on success (works with JS disabled)
- `// TODO: wire to ESP` seam + optional `WAITLIST_WEBHOOK_URL`

## Deploy

Point a **separate** Cloudflare Pages project at this `marketing/` directory:

- Build command: `npm run build` (set `PUBLIC_ENROLLMENT_MODE` in Pages env)
- Output directory: `dist`
- Functions root: `functions/`

Do not attach a custom domain until the cutover plan is ready. The product PWA must keep working.
