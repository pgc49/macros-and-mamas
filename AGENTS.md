# AGENTS.md — rules for working in this repo

Product spec and build order live in `AGENT-BRIEF.md`. Setup, env vars, and URLs live in `README.md`.
This file is the short list of things that have already broken in production. Read it before touching auth,
the signup funnel, or ad tracking.

## The revenue funnel is the most fragile code we own

The path that takes money is:

```
/quiz (Meta ads land here) -> ranges + Lock my spot CTA -> /signin?from=quiz&auth=create&email=
  -> create account + Terms -> /join -> Stripe Checkout -> intake -> Callie approves -> /dashboard
```

Every mama who pays goes through it exactly once. A bug here is not a bug report, it is a lost customer
who never comes back. Treat `src/App.jsx` (`SignInGate`, `JoinGate`), `src/auth/*`, `src/views/SignInPage.jsx`,
`src/views/JoinPage.jsx`, and `marketing/public/quiz-app.js` as high-blast-radius files.

## Auth rules (these caused a real outage)

**Never sign a user out automatically.** Only an explicit user action may end a session. We shipped an
effect that auto-called `signOut()` when the signed-in email did not match the quiz email. Supabase syncs
sessions across tabs, so an older tab sitting on a previous quiz email saw a brand-new signup, judged it
"wrong", and revoked it. Mamas were signed out the instant their account was created.

Concretely:

- No `signOut()` inside a `useEffect`, render path, or any automatic reaction to state.
- Wrong-account situations get an explicit button the user clicks (see the switch CTA on `/join`).
- `signOut()` must stay `{ scope: "local" }`. Supabase defaults to `global`, which revokes every session
  for that user, including other tabs and their phone.
- Assume **multiple tabs of this app are open at once** and that any auth change is broadcast to all of them.
  Ask "what does a stale tab do when it sees this?" before adding auth logic.

**Never gate the funnel on `user` being absent for one paint.** React `user` can be briefly null right after
signup while auth settles. `/join` used to read that as "signed out" and redirect to `/signin`, which looked
exactly like signup failing. Hold and re-check instead of bouncing; `joinCheckoutDecision` in
`src/auth/quizAuthHandoff.js` encodes this (`stay` / `hold` / `signin`).

**Decide identity from the URL, not from stored state.** `resolveQuizEmail` falls back to `sessionStorage`,
so a leftover address from an earlier attempt can make a valid session look wrong and block checkout. Use
`urlQuizEmail` for any gate or mismatch decision.

## Verifying funnel changes

Green unit tests are not sufficient for this path. Before shipping anything that touches auth, `/signin`,
`/join`, or the quiz handoff, reproduce in a real browser:

1. A clean incognito window, brand-new email: signup must land on checkout.
2. **A leftover session:** one tab on a previous quiz email, then sign up with a different email in a second
   tab. The new signup must reach checkout and keep its session. This is the case that broke, and a
   single-tab test will not catch it.
3. Confirm server-side, not just visually: the new user should have a row in `auth.sessions`. A missing
   session row means something revoked it.

Reusing a test email that already has an account correctly refuses and switches to sign-in. That is not the
bug; use a fresh address or sign in.

## Ad tracking and attribution

Meta ads point straight at `/quiz`, so attribution starts on the Astro marketing side and has to survive the
hop into the SPA.

- The chain is: Astro `BaseLayout` captures `fbclid` / `utm_*` into `sessionStorage` (`mm_attribution_v1`)
  -> quiz submit posts them to `/api/lead` -> `persistAttributionToProfile` stamps `profiles` at signup
  -> `/api/checkout` forwards them to Stripe metadata and CAPI -> the webhook reads that metadata for
  `Purchase`. Do not break a link in it.
- **Read `_fbp` / `_fbc` cookies fresh at submit time.** `fbevents.js` writes `_fbp` after the page-load
  attribution snapshot, so a first-touch visitor had no `fbp` in the stored snapshot and `Lead` went out
  missing a match signal. See `attrForSubmit()` in `marketing/public/quiz-app.js`.
- Every ad destination and email CTA must carry its `fbclid` / `utm_*` params. A link that strips them
  produces a profile with no attribution; there is nothing to recover later.
- After changing anything here, verify against the database: the new `marketing_leads` row should have both
  `fbp` and `fbc`, and the `profiles` row should have `fbclid`, `utm_*`, and `attributed_at`.

## Testing before every release

Do this on every change that will ship — not only the funnel. Green CI is not a substitute for
clicking through the thing a mama or Callie will see.

1. **`npm run test` and `npm run lint`** before you ask to merge or push `main`.
2. **Browser, not just unit tests, when UI/layout/routing/state changed.** Open the app and exercise
   the changed flow the way a mama or Callie would: click, type, submit, navigate. A single screenshot
   of the new screen is not enough. Check the other tabs/routes that read the same state, plus empty
   and error states.
3. **Prefer the Cloudflare PR preview** (`*.pages.dev` on the PR) for anything that needs a real
   session, admin, Messages, Today banners, or voice drops. Local Vite is fine for copy/layout when a
   DEV preview route or `?demo…=1` flag exists. Do not claim “tested in preview” if you only ran local.
4. **Funnel changes** still need the incognito + leftover-session checks in “Verifying funnel changes”
   above. Those are extra, not instead of 1–3.
5. After `main` deploys, confirm the live page/asset actually updated before telling anyone it shipped.

### Test accounts (preview + production-shaped data)

Cloudflare previews share the live Supabase project. Signing in as a paying mama to “just check” is
not allowed. We need dedicated, labeled accounts the agent can use on preview:

- One **Cohort 2** mama (`cohort_label=2026-08`, paid/active, not a real customer)
- One **Founding** mama (`cohort_label=2026-07`, paid/active, not a real customer)
- Admin dogfood stays Callie/Patrick — **never** use `pgchammas@gmail.com` as a throwaway

Until those exist, say so in the write-up, test what you can locally, and do not invent a login.
When they are created, list the emails here (plus “comp, do not email/blast”) so every agent uses the
same three.

## Deploys

- `npm run test` (pixel + pricing + product suites) and `npm run lint` before pushing.
- Pushing to `main` deploys production. CI going green is **not** the same as the change being live.
- The Astro marketing overlay (`/`, `/quiz`, `quiz-app.js`) can lag the deploy job by a few minutes. When
  you change marketing or quiz files, fetch the asset and confirm the content actually changed before
  claiming it shipped. Cache-bust with a query param; do not trust a versioned filename to have moved.

## Observability

`quiz_signup_bounce` is a Sentry beacon on the signup-to-checkout path. If it fires outside of deliberate
testing, a real mama was pushed off checkout. Treat it as urgent and resolve it with a fix rather than
ignoring it, so Sentry re-alerts on regression.

## Production data

The Supabase project is live and holds paying customers. Never delete or mutate prod rows without an
explicit request. When cleaning up, inventory first, confirm nothing is `paid`, `refunded`, `comp`, or
`role = 'admin'`, and never touch `pgchammas@gmail.com` (the owner/admin account).
