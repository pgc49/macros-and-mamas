# Site analytics + signup conversion

Two layers, on purpose:

| Layer | What you see | Anonymous visitors? |
| --- | --- | --- |
| **Cloudflare Web Analytics** | Aggregate pageviews, paths, referrers, countries | Counts only — **no visitor ids**, nothing written to Supabase |
| **Supabase `profiles` attribution** | First-touch UTM / anon_id / landing path on people who create accounts | **Only at signup/join** (step 3). Browsers who never sign up leave no profile row |

Meta Pixel / CAPI remain for **ad optimization**. Do not use Events Manager as your only funnel.

## Anonymous ids — when do they appear?

**Cloudflare Web Analytics does not give you anonymous ids in Supabase.** It is cookie-less aggregate traffic.

We also set a first-party `mm_anon_id` in `localStorage` on marketing + public SPA routes. That id:

- stays in the browser while someone browses without signing up
- is **stitched onto `profiles.anon_id`** when they create an account / hit `/join` signed-in / pay (webhook backfill)
- does **not** create anonymous visit rows for people who bounce

So: you will **not** see a table of anonymous landers. You **will** see `anon_id` + UTMs on converted profiles (and waitlist leads still use `cohort_waitlist` UTMs).

## Cloudflare Web Analytics setup

1. Cloudflare dashboard → **Web Analytics** → **Add a site** (or enable for `macrosandmamas.com`).
2. Copy the **beacon token**.
3. Set env vars (Preview + Production):

| Env var | Project |
| --- | --- |
| `PUBLIC_CF_WEB_ANALYTICS_TOKEN` | Marketing Pages (`macrosandmamas-marketing`) |
| `VITE_CF_WEB_ANALYTICS_TOKEN` | SPA Pages (`macros-and-mamas`) |

4. Redeploy. Confirm the beacon loads on `/` and `/join` (Network → `beacon.min.js`), not on coaching tabs.

Optional: zone-level auto-inject can work once www is orange-clouded; the env token still helps on `*.pages.dev` previews.

## What gets written to `profiles`

Migration `038_profile_attribution.sql`:

- `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`
- `fbclid`, `landing_path`, `referrer_host`
- `anon_id`, `attributed_at`

**First-touch only** — later campaigns do not overwrite.

Written by:

1. Client after password signup (session present)
2. Client on public routes while signed in (`/join`, `/welcome`, …)
3. Stripe webhook backfill from Checkout metadata if the client stamp missed

## Funnel queries (Supabase SQL)

Homepage / join traffic volumes: **Cloudflare Web Analytics** dashboard.

Signup → paid by campaign:

```sql
select
  coalesce(nullif(utm_source, ''), '(none)') as utm_source,
  coalesce(nullif(utm_campaign, ''), '(none)') as utm_campaign,
  count(*) as accounts,
  count(*) filter (where paid) as paid,
  round(
    100.0 * count(*) filter (where paid) / nullif(count(*), 0),
    1
  ) as paid_pct
from public.profiles
where role = 'client'
  and created_at > now() - interval '30 days'
group by 1, 2
order by accounts desc;
```

Recent attributed signups:

```sql
select
  created_at::date,
  split_part(coalesce(name, ''), ' ', 1) as first_name,
  utm_source,
  utm_campaign,
  landing_path,
  paid,
  paid_at
from public.profiles
where role = 'client'
  and attributed_at is not null
order by created_at desc
limit 50;
```

Rough conversion (needs CF visit count pasted in):

```text
paid_this_week / cf_homepage_views_this_week
paid_this_week / cf_/join_views_this_week
```

## Plausible / Fathom

Neither offers a lasting **free cloud tier**:

- **Plausible Cloud** — paid (trial ~30 days); free only if you **self-host** Community Edition
- **Fathom** — paid (short trial); no free plan

Cloudflare Web Analytics + `profiles` attribution is the free path that matches this stack. Add Plausible/Fathom later only if you want nicer funnels/UI and are fine paying.

## Privacy

`src/content/privacy.js` mentions Cloudflare Web Analytics (aggregate) and first-touch attribution on account creation. Keep Meta measurement gated until that privacy copy is approved/live (see `docs/META-SETUP.md`).
