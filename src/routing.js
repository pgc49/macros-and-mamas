import { CONFIG } from "./config";

/** Canonical app paths */
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
  /** Signed-in tech/support form — coaching stays in Messages; this form is for Tech Guy. */
  support: "/support",
  /** Account hub + profile / payments (paid clients). */
  account: "/account",
  accountProfile: "/account/profile",
  accountPayments: "/account/payments",
  accountShare: "/account/share",
  /** Post–free-month paywall when monthly membership is required. */
  membership: "/membership",
};

/**
 * Full document load of `/` so www serves the Astro marketing homepage.
 * React Router <Link to="/"> stays inside the SPA and shows the old SalesPage.
 */
export function goMarketingHome() {
  window.location.assign(PATHS.home);
}

/**
 * Where a signed-in user should land after auth / cold load.
 * Pay-first: account → pay → intake → Callie approve → dashboard.
 * After founding free month without a sub → membership gate.
 *
 * www (customer surface) has no coach portal — admins stay in the mama app.
 * Coach UI is https://admin.macrosandmamas.com.
 */
export function homePathFor({
  isAdmin,
  approved,
  paid,
  macros,
  refunded,
  membershipPaywall = false,
  surface = import.meta.env.VITE_APP_SURFACE || "combined",
}) {
  if (isAdmin && surface !== "customer") return PATHS.admin;
  if (isAdmin) return PATHS.dashboard;
  if (refunded) return PATHS.goodbye;
  if (!paid) return PATHS.join;
  if (!macros) return PATHS.onboarding;
  if (!approved) return PATHS.pending;
  if (membershipPaywall) return PATHS.membership;
  return PATHS.dashboard;
}

/**
 * Coach portal href. On www (customer surface) this is the isolated admin
 * origin so Shell / support links do not SPA-navigate to a missing /admin.
 */
export function adminPortalHref({
  surface = import.meta.env.VITE_APP_SURFACE || "combined",
  origin = CONFIG.ADMIN_APP_URL,
} = {}) {
  if (surface === "customer") {
    try {
      return new URL(PATHS.admin, origin).toString();
    } catch {
      return "https://admin.macrosandmamas.com/admin";
    }
  }
  return PATHS.admin;
}

export function isExternalAdminHref(
  surface = import.meta.env.VITE_APP_SURFACE || "combined",
) {
  return surface === "customer";
}

/** Dashboard access: approve + pay, or admin dogfooding an approved intake. */
export function canAccessDashboard({
  isAdmin,
  approved,
  paid,
  macros,
  refunded,
  membershipPaywall = false,
}) {
  if (refunded) return false;
  if (membershipPaywall && !isAdmin) return false;
  return !!(macros && approved && (paid || isAdmin));
}

/** Map persisted client state to a path segment. */
export function pathFromClientView(view) {
  if (view === "app" || view === "dashboard") return PATHS.dashboard;
  if (view === "intake" || view === "onboarding") return PATHS.onboarding;
  if (view === "pending") return PATHS.pending;
  if (view === "join") return PATHS.join;
  if (view === "welcome") return PATHS.welcome;
  if (view === "goodbye") return PATHS.goodbye;
  if (view === "declined") return PATHS.declined;
  if (view === "signin") return PATHS.signin;
  return PATHS.home;
}
