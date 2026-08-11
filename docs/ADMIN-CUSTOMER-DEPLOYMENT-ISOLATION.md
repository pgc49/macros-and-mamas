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

## Cloudflare Pages draft configuration

Create the admin project before changing the existing customer build.

### Shared

- Production branch: `main`
- Root directory: repository root
- Output directory: `dist`
- Node: 22
- Copy the existing public Supabase/VAPID/Sentry environment values.
- `VITE_ADMIN_APP_URL=https://admin.macrosandmamas.com`

### Customer project

- Build: `npm run build:customer`
- Keep `www.macrosandmamas.com`.
- Configure Build watch exclusions for admin-only paths:
  - `src/admin/**`
  - admin-only documentation/tests
- Do **not** exclude shared messaging, auth, DB, migrations, Functions, config,
  routing, or build scripts; those changes must test/deploy both surfaces.

### Admin project

- Build: `npm run build:admin`
- First use the generated `*.pages.dev` preview.
- After acceptance, attach `admin.macrosandmamas.com`.
- Root redirects to `/admin`; all routes use the admin SPA shell.
- Consider Cloudflare Access as defense in depth, while retaining Supabase
  role checks. Verify installed-app push/open behavior before enforcing Access.

## Cutover order

1. Keep the existing production project unchanged.
2. Create the admin Pages project and preview deployment.
3. Test login, every admin tab, DM/channel send/read/reply/reaction/media, push,
   and account logout on the preview.
4. Attach `admin.macrosandmamas.com`; add it to Supabase redirect allowlists.
5. Have Callie sign in and register notifications on the admin origin.
6. Change the customer project build command to `npm run build:customer`.
7. Deploy customer preview; verify `/admin?...` transfers query/hash to the
   admin origin and customer routes remain unchanged.
8. Promote customer only after both previews pass.

## Acceptance criteria

- Customer `surface-manifest.json`: `surface=customer`, `adminChunkCount=0`.
- Admin manifest: `surface=admin`, `adminChunkCount=1`.
- An edit only under `src/admin/**` creates no customer deployment.
- Customer build ID does not change after an admin-only deployment.
- Admin and customer can be rolled back independently.
- A shared schema/API release remains compatible with the previous build of
  both surfaces.
- Callie's old `www` push subscription is removed or allowed to expire after
  the new admin-origin subscription is verified.

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

