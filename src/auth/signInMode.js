import { CONFIG } from "../config";
import { PATHS } from "../routing";

/**
 * /signin mode. Admin hosts stay sign-in even when ?auth=create or first-visit
 * intake would otherwise open create-account on www.
 */
export function resolveSignInMode({
  authMode = "signin",
  search = "",
  from,
  enrollmentOpen = CONFIG.ENROLLMENT_OPEN,
  signupLocked = false,
} = {}) {
  if (signupLocked) return "signin";
  const params = new URLSearchParams(
    typeof search === "string" && search.startsWith("?") ? search.slice(1) : search,
  );
  const auth = params.get("auth");
  if (
    auth === "signin"
    || from === PATHS.support
    || (from && String(from).startsWith("/account"))
  ) {
    return "signin";
  }
  if (from === PATHS.join || auth === "create") {
    return enrollmentOpen ? "create" : "signin";
  }
  return authMode === "create" ? "create" : "signin";
}

/** Ignore create-account switches on the admin surface. */
export function nextAuthSwitch(next, { signupLocked = false } = {}) {
  if (signupLocked && next === "create") return null;
  return next === "create" ? "create" : "signin";
}
