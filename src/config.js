/* ------------------------------------------------------------------ */
/*  CONFIG — every external dependency lives here.                     */
/* ------------------------------------------------------------------ */

function envUrl(name) {
  const v = import.meta.env[name];
  if (typeof v !== "string") return "";
  const trimmed = v.trim();
  if (!trimmed || trimmed.includes("{{") || trimmed.includes("PLACEHOLDER")) return "";
  return trimmed;
}

// Public by design under RLS. Prefer Vite env so preview/prod can differ;
// fallbacks are this project's publishable credentials.
const SUPABASE_URL =
  envUrl("VITE_SUPABASE_URL") || "https://reangkqbsazwxvrqvsdo.supabase.co";
const SUPABASE_ANON_KEY =
  envUrl("VITE_SUPABASE_ANON_KEY") ||
  "sb_publishable_VZroN1jvDKeAjcaBkmyGFw_yhsl0d5G";

export const CONFIG = {
  // Stripe Checkout Session is created by /api/checkout after account
  // create (account → pay → intake → approve → unlock). No Payment Link.
  // Server picks Price ID: founding $149 / waitlist $249 / full $299.
  CHECKOUT_ENDPOINT: "/api/checkout",
  CHECKOUT_QUOTE_ENDPOINT: "/api/checkout-quote",
  QUIZ_LEAD_ENDPOINT: "/api/quiz-lead",
  BILLING_ENDPOINT: "/api/billing",
  MEMBERSHIP_CHECKOUT_ENDPOINT: "/api/membership-checkout",
  REFUND_ENDPOINT: "/api/refund",
  INTAKE_SUBMITTED_ENDPOINT: "/api/intake-submitted",
  MACROS_APPROVED_ENDPOINT: "/api/macros-approved",

  /** Display amounts only — Stripe Price IDs stay on the server. */
  PRICE_TIERS: {
    founding: { amount: 149, label: "Founding" },
    waitlist: { amount: 249, label: "Waitlist early" },
    full: { amount: 299, label: "Full" },
  },

  // Meal photo analysis — legacy; prefer ESTIMATE_ENDPOINT.
  ANALYZE_ENDPOINT: "/api/analyze",
  // Photo + text meal estimates (OpenRouter), auth-gated.
  ESTIMATE_ENDPOINT: "/api/estimate",

  // Supabase project URL + anon (publishable) key.
  // The anon key is safe client-side ONLY with row-level security on
  // every table. Service-role key never ships to the client.
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  ADMIN_APP_URL: envUrl("VITE_ADMIN_APP_URL") || "https://admin.macrosandmamas.com",

  // Private WhatsApp invite — shown in approve email; optional in-app tip.
  WHATSAPP_GROUP_URL:
    envUrl("VITE_WHATSAPP_GROUP_URL") ||
    "https://chat.whatsapp.com/GxlqCrLUooN36ST2QqHrX3",
  FULLSCRIPT_ELECTROLYTES: envUrl("VITE_FULLSCRIPT_ELECTROLYTES_URL"),
  FULLSCRIPT_SLEEP: envUrl("VITE_FULLSCRIPT_SLEEP_URL"),
  FULLSCRIPT_DIGESTION: envUrl("VITE_FULLSCRIPT_DIGESTION_URL"),

  // Client: allow create-account + /join routing (pre-sales open).
  // Server: quiz unlocks early $249; without quiz they can still pay full $299.
  // OPEN_WITHOUT_QUIZ=true would give everyone $249 (usually leave false).
  ENROLLMENT_OPEN: true,
  /** ISO cutoff: accounts created before this may still finish paying while closed. */
  ENROLLMENT_CLOSED_AT: "2026-07-26T02:00:00.000Z",
  WAITLIST_COHORT: "cohort_2",
  /**
   * Next cohort — keep in sync with marketing/src/config.ts.
   * Always set an expected start date before selling seats.
   */
  /** Customer-facing label — no numbered “Cohort 2”; dates carry the meaning. */
  COHORT_LABEL: "your spot",
  COHORT_START: "Monday, Aug 31",
  COHORT_START_SHORT: "August 31",
  COHORT_START_COMPACT: "Aug 31",

  /**
   * Meta Pixel (browser). Set VITE_META_PIXEL_ID in Cloudflare Pages.
   * Pixel script loads only on public routes — never on coaching tabs.
   * Leave empty until privacy update is live and Pixel ID is ready.
   */
  META_PIXEL_ID: envUrl("VITE_META_PIXEL_ID"),

  /**
   * Cloudflare Web Analytics (browser beacon). Aggregate pageviews only —
   * no visitor ids in Supabase. Public routes only. See docs/ANALYTICS.md.
   */
  CF_WEB_ANALYTICS_TOKEN: envUrl("VITE_CF_WEB_ANALYTICS_TOKEN"),

  /**
   * Google Tag Manager container (GTM-XXXX). Optional. Public routes only.
   * Prefer this if you will add Google Ads tags later without another deploy.
   * Do not also configure the same GA4 stream inside GTM if GA_MEASUREMENT_ID
   * is set — that double-counts pageviews. See docs/GOOGLE-SETUP.md.
   */
  GTM_ID: envUrl("VITE_GTM_ID"),

  /**
   * GA4 measurement ID (G-XXXX) via gtag.js. Public routes only.
   * Least dashboard work: create a GA4 property, paste this, redeploy.
   */
  GA_MEASUREMENT_ID: envUrl("VITE_GA_MEASUREMENT_ID"),
};

/** True when public checkout / new signups are open. */
export function isEnrollmentOpen() {
  return CONFIG.ENROLLMENT_OPEN === true;
}

/**
 * While enrollment is closed, only accounts created before ENROLLMENT_CLOSED_AT
 * may finish paying (already-started founding checkouts).
 */
export function canFinishPaying(createdAtIso) {
  if (isEnrollmentOpen()) return true;
  if (!createdAtIso) return false;
  const closed = Date.parse(CONFIG.ENROLLMENT_CLOSED_AT);
  const created = Date.parse(createdAtIso);
  return Number.isFinite(created) && Number.isFinite(closed) && created < closed;
}

/** True when a config URL is set and safe to render as a link. */
export function hasPublicUrl(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}
