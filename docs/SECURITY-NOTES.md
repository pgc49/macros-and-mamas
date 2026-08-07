# Security notes (post–www cutover)

## Fixed (2026-08)

| Issue | Fix |
| --- | --- |
| Client could backdate `profiles.created_at` to unlock founding $149 | Migration `040_freeze_profile_created_at` + checkout uses `auth.users.created_at` |
| Quiz re-submit could overwrite pregnant/vegan segment → unlock $249 | Sticky exit segments in `lead.ts` upsert |
| `emailHasQuizUnlock` used PostgREST `ilike` (wildcard risk) | Switched to `email=eq.` |
| Unknown URLs returned marketing `/` as 200 (CF SPA fallback) | Astro `404.astro` → `dist/404.html` |
| Stale `/spa/` shell | Overlay plants redirect shim + force `_redirects`; purge CF cache for `/spa*` |
| Open `/api/lead` abuse | KV rate limit (`lead-rl:{ip}`, same `WAITLIST` binding as waitlist) |
| Callie notify hardcoded `$149` | Webhook passes real `amount_usd`; `notify-callie` uses `amountUsd` |
| Welcome email double-send on Stripe retry | `hasEmailEvent` gates welcome + `callie_payment` |
| Anon insert on `cohort_waitlist` | Migration `041_cohort_waitlist_no_anon_insert`; SPA uses `POST /api/waitlist` |

## Sound by design

- Clients cannot set `paid` / `refunded` / `role` (payment privilege triggers)
- Stripe webhook verifies signature + skew window
- Checkout price IDs chosen server-side only
- `marketing_leads` RLS on, no anon policies (service-role writes)
- `cohort_waitlist` inserts are service-role only (via `/api/waitlist`)
- AI estimate endpoints require JWT + paid/admin

## Ops checklist

1. After deploy: purge Cloudflare cache for `/spa`, `/spa/`, `/spa/*`, `/app*`
2. Confirm Production secrets: `RESEND_API_KEY`, `STRIPE_PRICE_ID_WAITLIST`, `STRIPE_PRICE_ID_LAB_ADDON=price_1U1vfzRyN0PahoiM6AVgkMYh`
3. Keep `OPEN_WITHOUT_QUIZ` unset unless intentionally opening $249 without quiz
4. Unknown path smoke: `/nope` should be a real 404 page, not the homepage
5. Confirm Pages has a `WAITLIST` KV binding (rate limits for `/api/lead` + `/api/waitlist`)
