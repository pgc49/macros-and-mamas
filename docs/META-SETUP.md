# Meta Pixel + CAPI setup (manual checklist)

No Meta Ads MCP in this environment. Do these in Business Manager, then paste secrets into Cloudflare Pages.

## Before Pixel goes live

1. **Approve** the Privacy Policy update (Meta measurement / CCPA “share” language) in `src/content/privacy.js`.
2. Do **not** set `VITE_META_PIXEL_ID` / `META_*` env vars until that privacy copy is merged and live.

## Your steps in Meta

1. Create/confirm **Meta Business Suite / Business Manager**.
2. Create an **Ad account** (billing can wait).
3. **Events Manager → Connect data → Web → Meta Pixel → Create**  
   Name e.g. `Macros and Mamas Web`. Copy **Pixel ID**.
4. **Generate Conversions API access token** for that Pixel  
   (Events Manager → Settings → Generate access token). Store in a password manager.
5. **Domain verification** for `macrosandmamas.com`  
   Meta-tag: set `PUBLIC_META_DOMAIN_VERIFY` on the marketing Pages project  
   (or DNS TXT if you prefer).
6. Paste into Cloudflare Pages (SPA project and/or marketing project as noted):

| Env var | Where | Notes |
| --- | --- | --- |
| `VITE_META_PIXEL_ID` | SPA (Vite) | Browser Pixel |
| `PUBLIC_META_PIXEL_ID` | Marketing Astro | Browser Pixel |
| `META_PIXEL_ID` | Both (Functions) | CAPI |
| `META_CAPI_ACCESS_TOKEN` | Both (Functions) | Secret |
| `META_CAPI_TEST_EVENT_CODE` | Both (optional) | Test Events only |
| `PUBLIC_META_DOMAIN_VERIFY` | Marketing (optional) | Domain verify meta tag |
| `PUBLIC_NOINDEX=true` | Marketing staging | Keep until www cutover |

7. After deploy: Meta **Test Events** → submit waitlist → confirm **Lead**.  
   When enrollment is open: test checkout → **Purchase** (deduped once).
8. Only then create a campaign optimized for **Lead** → `https://www.macrosandmamas.com/waitlist`.

## Agent-built pieces (already in repo)

- Attribution helper + public-route Pixel loader (SPA)
- Waitlist Lead (Pixel + CAPI) with shared `event_id`
- Checkout `InitiateCheckout` (Pixel + CAPI) + Stripe metadata
- Webhook `Purchase` CAPI + Welcome page Pixel Purchase (same `event_id`)
- Supabase migration `036_cohort_waitlist_attribution.sql`
- Astro `/` member/PWA guard + `/waitlist` → `cohort_waitlist`
- Manifest `start_url` → `/dashboard` for **new** installs

## Verify before spend

- [ ] Test Events shows Lead (and Purchase in test mode)
- [ ] Purchase appears once (not doubled)
- [ ] Event Match Quality not empty (email hash)
- [ ] Waitlist row in Supabase has UTM / `event_id` columns populated
