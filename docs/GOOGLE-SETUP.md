# Google tag + Analytics setup

**Short answer:** I can wire the site. You have to create the Google (and Meta) accounts, copy IDs, and paste them into Cloudflare. Campaigns, billing, and Ads Manager stay yours.

Nothing loads until those env vars are set. Coaching tabs (`/dashboard`, intake, admin) never get these scripts.

## You vs agent

| Task | Who | Time |
| --- | --- | --- |
| Google tag / GA4 snippets, conversion events, privacy copy | Agent (this PR) | Already in the repo |
| Create a Google account / GA4 property, copy `G-XXXXXXXX` | **You** | ~10–15 min |
| Paste `VITE_GA_MEASUREMENT_ID` (and optional `VITE_GTM_ID`) into Cloudflare Pages | **You** | ~5 min + one redeploy |
| Confirm events in GA4 Realtime | You (I can tell you what to click) | ~10 min after deploy |
| Google Ads campaigns / billing | **You** (optional, later) | whenever you buy traffic |
| Meta Pixel + CAPI code | Agent (already in repo) | Done |
| Meta Business Manager, Pixel, CAPI token, domain verify, Ads Manager campaigns | **You** | ~20–30 min (see `docs/META-SETUP.md`) |
| www / admin cutover (Cloudflare secrets, cache purge, smoke) | **You** | see `docs/WWW-CUTOVER.md` |

I cannot create Google or Meta accounts, accept their terms, or set Cloudflare Pages env vars from here.

## Recommended path (least of your time)

1. Merge this PR (privacy copy mentions Google Analytics).
2. [analytics.google.com](https://analytics.google.com) → create a **GA4** property for `macrosandmamas.com`.
3. Admin → Data streams → Web → copy the **Measurement ID** (`G-…`).
4. Cloudflare → **`macros-and-mamas`** (SPA / www) → Settings → Environment variables → Production **and** Preview:

   | Var | Value |
   | --- | --- |
   | `VITE_GA_MEASUREMENT_ID` | `G-XXXXXXXX` |

   The www overlay copies this onto the marketing HTML as `PUBLIC_GA_MEASUREMENT_ID`, so you do **not** need a second paste for production www.

5. Optional, marketing staging project `macrosandmamas-marketing`: set `PUBLIC_GA_MEASUREMENT_ID` the same way if you want analytics on `*.pages.dev` previews.
6. Redeploy (or wait for the next git deploy). Confirm `gtag/js?id=G-` in Network on `/` and `/join`, **not** on `/dashboard`.
7. GA4 → Reports → Realtime: open `/quiz`, submit a test lead, confirm `generate_lead`.

Skip Google Tag Manager unless you later want Google Ads conversion tags without another code deploy.

## Optional: Google Tag Manager

If you create a GTM container (`GTM-XXXX`):

| Var | Where |
| --- | --- |
| `VITE_GTM_ID` | SPA / www (`macros-and-mamas`) |
| `PUBLIC_GTM_ID` | Marketing staging project only |

**Do not** add the same GA4 stream as a GTM tag if `VITE_GA_MEASUREMENT_ID` is already set — pageviews will double. Pick one:

- **GA4 id only** (recommended now) — events fire from code.
- **GTM only** — leave `VITE_GA_MEASUREMENT_ID` empty; in GTM add a GA4 Configuration tag + events for `generate_lead`, `begin_checkout`, `purchase`, `quiz_start`.

## Events already wired

| Event | Where |
| --- | --- |
| `page_view` | Marketing pages + public SPA routes |
| `quiz_start` / `quiz_step` / `quiz_halfway` / `quiz_email_gate` | `/quiz` |
| `generate_lead` | Qualified quiz submit + waitlist |
| `quiz_nurture` | Non-enrollable quiz segments (pregnant / vegan) — not a lead |
| `begin_checkout` | Stripe Checkout start |
| `purchase` | `/welcome` after `profiles.paid` (same `event_id` as Meta) |

Health-adjacent quiz answers are **not** sent to Google.

## Google Ads later

Analytics is enough to see traffic. To **buy** Google ads you still need a Google Ads account, billing, and conversion actions. GTM is the least-friction way to add those tags later. Meta remains the primary paid channel (`docs/META-SETUP.md`).
