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
  // Stripe Checkout Session is created by /api/checkout after Callie
  // approves (intake → approve → pay → unlock). No Payment Link.
  CHECKOUT_ENDPOINT: "/api/checkout",

  // Meal photo analysis — legacy; prefer ESTIMATE_ENDPOINT.
  ANALYZE_ENDPOINT: "/api/analyze",
  // Photo + text meal estimates (OpenRouter), auth-gated.
  ESTIMATE_ENDPOINT: "/api/estimate",

  // Supabase project URL + anon (publishable) key.
  // The anon key is safe client-side ONLY with row-level security on
  // every table. Service-role key never ships to the client.
  SUPABASE_URL,
  SUPABASE_ANON_KEY,

  // Optional public links — hide UI if unset (Callie may invite by text).
  WHATSAPP_GROUP_URL: envUrl("VITE_WHATSAPP_GROUP_URL"),
  FULLSCRIPT_ELECTROLYTES: envUrl("VITE_FULLSCRIPT_ELECTROLYTES_URL"),
  FULLSCRIPT_SLEEP: envUrl("VITE_FULLSCRIPT_SLEEP_URL"),
  FULLSCRIPT_DIGESTION: envUrl("VITE_FULLSCRIPT_DIGESTION_URL"),
};

/** True when a config URL is set and safe to render as a link. */
export function hasPublicUrl(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}
