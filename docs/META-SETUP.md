# Meta Pixel + CAPI setup

Live Pixel ID: **`1078367721716098`**. It is public (it ships in the browser snippet). Do **not** paste Meta’s generic “every page” snippet by hand — the site already has the base code and conversion events. Matt’s email is the standard Events Manager template; we implemented the recommended/advanced version in code.

## What is already installed (this PR)

| Meta asked for | What we ship |
| --- | --- |
| Base code (`fbq('init')` + `PageView`) | Marketing pages (`/`, `/quiz`, `/waitlist`, `/thanks`) and public SPA routes (`/join`, `/welcome`, `/signin`) |
| Event code | `Lead` (qualified quiz + waitlist), `InitiateCheckout`, `Purchase`, plus quiz custom events |
| Data matching | Email / name / phone sent into Pixel `init` on Lead; hashed email, phone, name, and billing address (when collected) on CAPI |
| Every page of the website | **No** — not on `/dashboard`, intake, or admin. Those are the coaching app (health data). Ads only need public pages. |

After this merges and production deploys, Events Manager should show **PageView** from www (allow ~20 minutes). Use **Test Events** to confirm Lead.

## Still yours in Meta / Cloudflare

Browser Pixel works without more env vars. Server-side **Conversions API** (needed for iPhone ads) still needs a secret:

1. Events Manager → Pixel → Settings → **Generate access token**.
2. Cloudflare → **`macros-and-mamas`** → Settings → Environment variables (Production + Preview):

   | Var | Value |
   | --- | --- |
   | `META_CAPI_ACCESS_TOKEN` | the token (secret) |
   | `META_PIXEL_ID` | `1078367721716098` (optional — code already defaults to this) |
   | `META_CAPI_TEST_EVENT_CODE` | optional, Test Events only |

3. Domain verification for `macrosandmamas.com` if Events Manager still asks (meta tag `PUBLIC_META_DOMAIN_VERIFY` or DNS TXT).
4. Test Events: open `/quiz`, submit a qualified lead, confirm **Lead**. Paid checkout should show **Purchase** once (browser + CAPI share `event_id` so it does not double).

Do not create a second Pixel. Do not paste a second copy of the base code into Google Tag Manager.

## Events (for Ads Manager optimization)

| Event | When |
| --- | --- |
| `PageView` | Public page load (and SPA public route changes) |
| `Lead` | Qualified ranges quiz submit, or waitlist form |
| `QuizNurture` (custom) | Pregnant / fully vegan quiz — not a Lead |
| `QuizStart` / `QuizStep` / `QuizHalfway` / `QuizEmailGate` | Quiz progress (retargeting) |
| `InitiateCheckout` | Mama clicks pay |
| `Purchase` | Stripe paid (`/welcome` Pixel + webhook CAPI, **same Stripe `session.id`**) |

Cold ads should still point at `https://www.macrosandmamas.com/quiz` (or `/` for retargeting), not the generic waitlist unless Matt is running a waitlist campaign.

## Verify before spend

- [ ] Events Manager status Active (PageView)
- [ ] Test Events shows Lead (and Purchase in a test checkout)
- [ ] Purchase appears once, not doubled
- [ ] Event Match Quality is not empty (email hash)
- [ ] Pixel Helper on `/` and `/quiz` shows Pixel `1078367721716098`; **not** on `/dashboard`
