/* ------------------------------------------------------------------ */
/*  CONFIG — every external dependency lives here.                     */
/*  Replace remaining {{PLACEHOLDER}} tokens before launch.            */
/* ------------------------------------------------------------------ */

// Public by design under RLS. Prefer Vite env so preview/prod can differ;
// fallbacks are this project's publishable credentials.
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || "https://reangkqbsazwxvrqvsdo.supabase.co";
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_VZroN1jvDKeAjcaBkmyGFw_yhsl0d5G";

export const CONFIG = {
  // Stripe Checkout Session is created by /api/checkout after Callie
  // approves (intake → approve → pay → unlock). No Payment Link.
  CHECKOUT_ENDPOINT: "/api/checkout",

  // Meal photo analysis — Cloudflare Pages Function (OpenRouter).
  ANALYZE_ENDPOINT: "/api/analyze",

  // Supabase project URL + anon (publishable) key.
  // The anon key is safe client-side ONLY with row-level security on
  // every table. Service-role key never ships to the client.
  SUPABASE_URL,
  SUPABASE_ANON_KEY,

  // PROD-TODO(whatsapp): Callie invites each mama personally by text
  // after approval, so this may stay a no-op. If a group invite link
  // is ever used instead, it goes here.
  WHATSAPP_GROUP_URL: "{{WHATSAPP_GROUP_INVITE_URL}}",

  // PROD-TODO(fullscript): Callie's practitioner links.
  FULLSCRIPT_ELECTROLYTES: "{{FULLSCRIPT_ELECTROLYTES_URL}}",
  FULLSCRIPT_SLEEP: "{{FULLSCRIPT_SLEEP_URL}}",
  FULLSCRIPT_DIGESTION: "{{FULLSCRIPT_DIGESTION_URL}}",
};
