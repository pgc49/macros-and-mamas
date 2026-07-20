/** Canonical app paths */
export const PATHS = {
  home: "/",
  join: "/join",
  welcome: "/welcome",
  goodbye: "/goodbye",
  onboarding: "/onboarding",
  signin: "/signin",
  pending: "/pending",
  declined: "/declined",
  dashboard: "/dashboard",
  admin: "/admin",
  terms: "/terms",
};

/**
 * Where a signed-in user should land after auth / cold load.
 * Pay-first: account → pay → intake → Callie approve → dashboard.
 */
export function homePathFor({ isAdmin, approved, paid, macros, refunded }) {
  if (isAdmin) return PATHS.admin;
  if (refunded) return PATHS.goodbye;
  if (!paid) return PATHS.join;
  if (!macros) return PATHS.onboarding;
  if (!approved) return PATHS.pending;
  return PATHS.dashboard;
}

/** Dashboard access: approve + pay, or admin dogfooding an approved intake. */
export function canAccessDashboard({ isAdmin, approved, paid, macros, refunded }) {
  if (refunded) return false;
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
