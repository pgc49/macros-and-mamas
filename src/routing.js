/** Canonical app paths */
export const PATHS = {
  home: "/",
  onboarding: "/onboarding",
  signin: "/signin",
  pending: "/pending",
  declined: "/declined",
  dashboard: "/dashboard",
  admin: "/admin",
  terms: "/terms",
};

/** Where a signed-in user should land after auth / cold load. */
export function homePathFor({ isAdmin, approved, paid, macros }) {
  if (isAdmin) return PATHS.admin;
  if (macros && approved && paid) return PATHS.dashboard;
  if (macros) return PATHS.pending;
  return PATHS.onboarding;
}

/** Dashboard access: approve + pay, or admin dogfooding an approved intake. */
export function canAccessDashboard({ isAdmin, approved, paid, macros }) {
  return !!(macros && approved && (paid || isAdmin));
}

/** Map persisted client state to a path segment (legacy "app" → dashboard). */
export function pathFromClientView(view) {
  if (view === "app" || view === "dashboard") return PATHS.dashboard;
  if (view === "intake" || view === "onboarding") return PATHS.onboarding;
  if (view === "pending") return PATHS.pending;
  if (view === "declined") return PATHS.declined;
  if (view === "signin") return PATHS.signin;
  return PATHS.home;
}
