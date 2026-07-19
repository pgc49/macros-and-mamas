/* ------------------------------------------------------------------ */
/*  PROD-TODO: CONFIG — every external dependency lives here.          */
/*  Replace each {{PLACEHOLDER}} before launch.                        */
/* ------------------------------------------------------------------ */
export const CONFIG = {
  // PROD-TODO(stripe): One product, $149 founding price.
  // Option A (ships fastest): a plain Stripe Payment Link pasted here.
  // Option B (do it right): a Checkout Session created by a Pages
  // Function + webhook that provisions the Supabase account.
  // SEQUENCING DECISION REQUIRED: the intake gates DECLINE some
  // applicants (pregnant, <6mo postpartum breastfeeding, veg/vegan).
  // Either run intake BEFORE payment (recommended — no refunds needed)
  // or charge first and refund declines. Current UI assumes
  // intake -> Callie approves -> payment link sent.
  STRIPE_PAYMENT_LINK: "{{STRIPE_PAYMENT_LINK_URL}}",

  // PROD-TODO(api): Cloudflare Pages Function endpoint that proxies
  // the meal photo to the Anthropic Messages API. The ANTHROPIC_API_KEY
  // lives ONLY as a Cloudflare secret on the server — never here.
  ANALYZE_ENDPOINT: "/api/analyze",

  // PROD-TODO(supabase): project URL + anon (publishable) key.
  // The anon key is safe client-side ONLY with row-level security on
  // every table. Service-role key never ships to the client.
  SUPABASE_URL: "{{SUPABASE_PROJECT_URL}}",
  SUPABASE_ANON_KEY: "{{SUPABASE_ANON_KEY}}",

  // PROD-TODO(whatsapp): Callie invites each mama personally by text
  // after approval, so this may stay a no-op. If a group invite link
  // is ever used instead, it goes here.
  WHATSAPP_GROUP_URL: "{{WHATSAPP_GROUP_INVITE_URL}}",

  // PROD-TODO(fullscript): Callie's practitioner links.
  FULLSCRIPT_ELECTROLYTES: "{{FULLSCRIPT_ELECTROLYTES_URL}}",
  FULLSCRIPT_SLEEP: "{{FULLSCRIPT_SLEEP_URL}}",
  FULLSCRIPT_DIGESTION: "{{FULLSCRIPT_DIGESTION_URL}}",
};
