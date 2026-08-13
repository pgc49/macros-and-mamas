# Admin/customer deployment isolation (draft)

This runbook is **not approved to ship**. It prepares independent Cloudflare
Pages deployments so an admin-only UI change cannot publish a new customer app.

## Target

| Surface | Project/domain | Build command | Output |
|---|---|---|---|
| Customer/PWA | existing `www.macrosandmamas.com` project | `npm run build:customer` | `dist` |
| Coach admin | new `admin.macrosandmamas.com` project | `npm run build:admin` | `dist` |

Both use the same Supabase project and additive/backward-compatible messaging
schema. They have independent Cloudflare deployments, aliases, and rollbacks.

The customer compiler removes the `AdminPortal` dynamic import. CI fails if an
`AdminPortal-*` chunk or source reference appears in the customer artifact. The
admin artifact must contain exactly one admin chunk.

## Out of scope

This is the simplified path. It does **not** include:

- Admin-to-admin DMs (`admin_dm_conversations`, inbox rewrite, compatibility freeze)
- Messaging kill switches / health RPCs
- A Git-synced Supabase preview replay of the full production schema

Patrick and Callie test messaging as **mama accounts** (`role=client`) in the
same Callie 1:1 threads customers use. Do not merge #221, #224, or #225 for this
cutover.

## Cloudflare Pages draft configuration

Create the admin project before changing the existing customer build.

### Shared

- Production branch: `main`
- Root directory: repository root
- Output directory: `dist`
- Node: 22
- Copy the complete existing production + preview environment/binding set.
- `VITE_ADMIN_APP_URL=https://admin.macrosandmamas.com`

Both draft artifacts still include shared Pages Functions, so both projects
need the same server configuration until Functions are split:

- Supabase URL, anon key, and service-role key
- Stripe secret/webhook secret and every active price/config ID
- Resend, OpenRouter/model, GitHub support, Meta CAPI secrets
- `CRON_SECRET`, `CALLIE_NOTIFY_EMAIL`, enrollment/cohort/referral settings
- every public `VITE_*` value (Supabase, VAPID, Sentry, URLs)
- KV binding `WAITLIST` (same namespace/configuration)

Compare the existing Pages project inventory field-for-field before preview
testing. Never expose production secrets to untrusted branch previews.

External ownership remains singular:

- Stripe webhook: customer/www only
- GitHub cron workflows: customer/www only
- Marketing/Meta lead endpoints: customer/www only
- No duplicate Cloudflare cron triggers on admin

### Customer project

- Build: `npm run build:customer`
- Keep `www.macrosandmamas.com`.
- Disable Git-integrated automatic production deployment before enabling the
  guarded repository deployment workflow.

### Admin project

- Build: `npm run build:admin`
- First use the generated `*.pages.dev` preview.
- After acceptance, attach `admin.macrosandmamas.com`.
- Root redirects to `/admin`; all routes use the admin SPA shell.
- Consider Cloudflare Access as defense in depth, while retaining Supabase
  role checks. Verify installed-app push/open behavior before enforcing Access.

## Deterministic deployment workflow

Manual preview deployment uses `.github/workflows/deploy-app-surfaces.yml` and
always deploys a non-production `preview-{run_id}` branch. It is disabled unless
`ENABLE_ISOLATED_SURFACE_PREVIEWS=true`.

Production deployment is downstream of every `SPA quality` job and requires
`ENABLE_ISOLATED_SURFACE_DEPLOYS=true` plus approval in protected GitHub
environment `app-surfaces-production`.

Before enabling:

1. Set repository variables `CUSTOMER_PAGES_PROJECT`, `ADMIN_PAGES_PROJECT`,
   `CUSTOMER_APP_URL`, `ADMIN_APP_URL`, and every public `VITE_*` value.
2. Add `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` secrets.
3. Disable Git auto-production deployment on both Pages projects.
4. Protect GitHub environments `app-surfaces-preview` and
   `app-surfaces-production` with appropriate reviewers.
5. Enable previews and use `workflow_dispatch` to test each project.
6. Enable production deployment only after preview acceptance.

Shared changes deploy both surfaces. A commit is customer-neutral only when
every changed path is explicitly admin-only, avoiding Pages watch-path bypass
limits on unusually large pushes.

## Cutover order

1. Keep the existing production project unchanged.
2. Create the admin Pages project and preview deployment.
3. Test login, every admin tab, DM/channel send/read/reply/reaction/media, push,
   and account logout on the preview.
4. Attach `admin.macrosandmamas.com`; add it to Supabase redirect allowlists.
5. Record and remove Callie's old `www` push subscriptions, then have her sign
   in and register notifications on the admin origin. Verify the new row before
   relying on admin push.

   The `push_subscription_origin` migration makes this automatic when the new
   admin-origin subscription is saved: legacy/null and non-admin-origin
   endpoints for that admin are removed while same-origin devices remain.

   Run only during the approved cutover, after recording the count:

   ```sql
   select count(*) from public.push_subscriptions
   where profile_id = (
     select id from public.profiles
     where lower(email) = 'calista@nourishwithcalista.com'
   );

   delete from public.push_subscriptions
   where profile_id = (
     select id from public.profiles
     where lower(email) = 'calista@nourishwithcalista.com'
   );
   ```
6. Change the customer project build command to `npm run build:customer`.
7. Deploy customer preview; verify `/admin?...` transfers query/hash to the
   admin origin and customer routes remain unchanged.
8. Promote customer only after both previews pass.
9. Record both production deployment IDs, roll each project back independently,
   verify the other build ID is unchanged, then restore both deployments.

## Acceptance criteria

- Customer `surface-manifest.json`: `surface=customer`, `adminChunkCount=0`.
- Admin manifest: `surface=admin`, `adminChunkCount=1`.
- An edit only under `src/admin/**` creates no customer deployment.
- Customer build ID does not change after an admin-only deployment.
- Admin and customer can be rolled back independently.
- A shared schema/API release remains compatible with the previous build of
  both surfaces.
- Callie's old `www` push subscriptions are removed and replaced by a verified
  admin-origin subscription.
- Admin manifest starts at `/admin`; Callie's mama-DM and channel pushes open `/admin`.
- Both projects pass the complete secret/binding inventory.
- Stripe webhook and scheduled jobs still have exactly one owner.

## Rollback

- Admin issue: roll back only the admin Pages project. Customer stays untouched.
- Customer issue: roll back only customer. Admin stays available.
- Shared schema/API issue: use the documented backward-compatible application
  rollback; do not reverse destructive migrations during an incident.
- Keep `/admin` transfer configurable via `VITE_ADMIN_APP_URL`.

## Current limitation

This phase isolates frontend artifacts and deployments. Both Pages projects
still build the repository's shared Pages Functions. Admin-only Functions
remain authorization-gated but are not yet independently deployed. A later
phase can move admin control-plane APIs to a dedicated Worker/service binding
if backend deployment isolation becomes necessary.

