/** Canonical app paths — no Vite imports so Node overlay scripts can use them. */
export const PATHS = {
  home: "/",
  join: "/join",
  waitlist: "/waitlist",
  welcome: "/welcome",
  goodbye: "/goodbye",
  onboarding: "/onboarding",
  signin: "/signin",
  pending: "/pending",
  declined: "/declined",
  dashboard: "/dashboard",
  admin: "/admin",
  terms: "/terms",
  privacy: "/privacy",
  resetPassword: "/reset-password",
  /** Signed-in tech/support form — WhatsApp link prompts sign-in → GitHub issue. */
  support: "/support",
  /** Account hub + profile / payments (paid clients). */
  account: "/account",
  accountProfile: "/account/profile",
  accountPayments: "/account/payments",
  accountShare: "/account/share",
  /** Post–free-month paywall when monthly membership is required. */
  membership: "/membership",
};

/** Cloudflare pretty-URLs turn /signin into /signin/ — treat them as the same route. */
export function canonicalPath(pathname) {
  const p = String(pathname || "");
  if (p.length > 1 && /\/+$/.test(p)) return p.replace(/\/+$/, "") || "/";
  return p || "/";
}

/** Astro owns these on www; do not plant an SPA shell over them. */
export const MARKETING_OWNED_PATHS = new Set(["/", "/waitlist"]);
