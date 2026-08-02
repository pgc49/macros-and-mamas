# Macros and Mamas — Astro landing page implementation spec

You are building the public marketing homepage for macrosandmamas.com as a static Astro site deployed to Cloudflare Pages. The logged-in product is a separate React SPA and is out of scope; this page replaces the current marketing route.

**Source of truth:** `reference.html` in this folder. It is a complete, approved, single-file working prototype: final copy, final CSS (design tokens, all component styles), final section order, and final interaction behavior. Your job is to port it into a well-structured Astro project, not to redesign it. Do not rewrite copy. Do not restyle components. If something in these instructions conflicts with reference.html, reference.html wins for copy and visual design; these instructions win for architecture.

## 1. Stack and project setup

- Astro (latest stable), static output (`output: 'static'`). No React/Vue/Svelte islands; nothing on this page needs a framework.
- Deploy target: Cloudflare Pages. Include a `wrangler.toml` or standard Pages config as appropriate.
- Fonts: self-host via `@fontsource/marcellus`, `@fontsource/karla` (weights 400/500/700 + italic 400/700), `@fontsource/caveat` (weight 600). Remove the Google Fonts CDN `<link>` tags from reference.html. Preload the two most critical font files (Marcellus regular, Karla regular).
- Images: use `astro:assets` (`<Image />`) for all four photos in `/images` (copy them into `src/assets`). Serve responsive AVIF/WebP with JPEG fallback, explicit width/height to prevent layout shift. The base64 data URIs do not exist in reference.html (it already uses `/images/...` paths); map those paths to the optimized assets.
- Global CSS: lift the `<style>` block from reference.html into a global stylesheet or Astro component styles. Keep the CSS custom properties in `:root` exactly as-is; they mirror the product app's design tokens.

## 2. Enrollment mode system (critical)

The page has two business states. Exactly one is rendered at build time.

- Env var: `PUBLIC_ENROLLMENT_MODE` = `"waitlist"` | `"open"`. Default to `"waitlist"` if unset.
- In reference.html, elements carry `.st-wait` (waitlist-only) and `.st-open` (open-only) classes, toggled by a client-side preview widget (`.mode-toggle`) and `body[data-mode]` CSS. **Do not ship any of that.** In Astro, replace with build-time conditionals: render only the branch matching the env var, delete the other from output. Remove the `.mode-toggle` markup, its CSS, its JS, and the `[data-mode]` CSS rules entirely.
- State-dependent content (find every `.st-wait` / `.st-open` pair in reference.html): header CTA, hero form vs hero open-CTA block, pricing card (cohort label, price, price history, CTA button), final section form vs button, sticky mobile bar contents, one FAQ answer.
- Dates ("Monday, Aug 31", "Aug 27") and prices ($249 / $299 / $149) appear in multiple places. Centralize them in a single config file (`src/config.ts`: `cohortStartDate`, `doorsCloseDate`, `waitlistPrice`, `fullPrice`, `foundingPrice`, `enrollUrl`) and interpolate everywhere, so a date change is a one-line edit.

## 3. Component breakdown

Suggested structure (one `.astro` component per section, composed in `src/pages/index.astro`):

`Header`, `Hero` (includes `WaitlistForm`), `Ticker`, `TwoAm`, `CallieLetter`, `StatsStrip`, `Ranges` (includes the range-band UI card), `SystemCollage` (five `MiniCard`s: log-a-meal, voice note, plan/groceries, messages, habits), `Guardrail`, `WeeksArc`, `Quotes`, `FitCheck` (includes the family banner image), `Pricing`, `Faq`, `FinalCta`, `Footer`, `StickyCta`.

Reusable pieces: `RangeBand` (the pill-with-end-ticks motif, used in Ranges card and Pricing card), `WaitlistForm` (used in Hero and FinalCta; FinalCta variant includes the optional "Your season" select and dark styling).

## 4. Waitlist form handling

- Both forms POST name/email (+ optional `season` on the final form) to `/api/waitlist`.
- Implement as a Cloudflare Pages Function (`functions/api/waitlist.ts`). For v1: validate email server-side, store the signup (KV namespace or forward to the email provider's API; leave a clearly marked `// TODO: wire to ESP` seam with the payload shape ready), return a redirect to `/thanks` or render an inline success state.
- Add honeypot field + basic rate limiting for spam. No CAPTCHA.
- Progressive enhancement: the form must work with JS disabled (normal POST). Optionally enhance with a small inline `fetch` submit + success message, but the no-JS path is the baseline.
- Open mode: hero/pricing/final CTAs link to `enrollUrl` from config (the existing checkout flow). No form in open mode.

## 5. Interactions (port from reference.html, keep this small)

- Scroll reveals: `.rv` elements animate in via IntersectionObserver. Keep the pattern where animation styles are gated behind a `.js` class on `<html>` (added by an inline script) so content is never hidden without JS. Keep `prefers-reduced-motion` handling.
- Sticky mobile CTA bar: appears after the hero scrolls out of view (IntersectionObserver on the hero section). Hidden ≥880px.
- Ticker: pure CSS keyframe marquee; static wrapped row under `prefers-reduced-motion`.
- FAQ: native `<details>/<summary>`, no JS.
- Total JS budget: the two IntersectionObservers and the `.js` class snippet. Nothing else.

## 6. SEO / head

- Port title, meta description, canonical, OG/Twitter tags, and the Product JSON-LD from reference.html. JSON-LD price must come from the config and match the rendered mode ($249 waitlist / $299 open; availability `PreOrder` in waitlist mode, `InStock` or `LimitedAvailability` in open mode).
- Add `@astrojs/sitemap`, a `robots.txt`, and a real `og-image` reference (asset provided separately by us; use a placeholder path `/og-image.jpg` for now).
- Semantic structure is already correct in reference.html (single `h1`, sectioned `h2`s); preserve it.

## 7. Performance / accessibility bars

- Lighthouse mobile: 95+ performance, 100 accessibility, 100 SEO on the deployed preview.
- LCP element is the hero image or headline; hero image gets `fetchpriority="high"` and is not lazy-loaded. All other images `loading="lazy"`.
- No CLS from fonts (use `font-display: swap` via fontsource defaults) or images (explicit dimensions).
- Keep the existing aria labels/roles from reference.html (form labels, `role="img"` on the guardrail card, `aria-hidden` on decorative mode chips).

## 8. Things that are intentional — do not "fix"

- The quotes section contains bracketed placeholder text on purpose. Keep it verbatim, and keep the dashed placeholder note visible. Real member quotes are pending; do not invent testimonials.
- The Monday voice note player is a static visual, not a functional audio player. Do not add fake playback. (A real audio embed may come later; leave the markup easy to swap.)
- Emojis appear only inside the log-a-meal card's mode chips because they mirror the real app UI. Do not add emojis anywhere else, and do not remove these.
- The meal photo, family photos, and all copy are approved. No copy edits, including "improvements."
- En dashes/em dashes: the copy deliberately avoids em dashes. Keep it that way in any strings you touch (config, alt text, success messages).

## 9. Out of scope

- The logged-in app, /terms, /privacy, /app (link targets only).
- Ad-specific /waitlist variant (future fork of Hero + proof sections; structure components so this is easy, but do not build it).
- Analytics wiring (leave a documented slot in the layout head for a script tag).

## 10. Definition of done

1. `PUBLIC_ENROLLMENT_MODE=waitlist npm run build` and `=open` both produce correct static output with zero traces of the other mode and zero preview-toggle code.
2. Visual parity with reference.html at 390px and 1280px widths in both modes.
3. Form POST works with JS disabled; spam honeypot in place.
4. Lighthouse bars met on Cloudflare Pages preview deploy.
5. All dates/prices flow from `src/config.ts`.
