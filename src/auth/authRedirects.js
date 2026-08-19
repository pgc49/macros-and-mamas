import { isAdminSignupLockedSurface } from "./adminSignupLock";
import { DEFAULT_CUSTOMER_ORIGIN } from "../../functions/_shared/customerOrigin.js";

function currentOrigin(fallback = DEFAULT_CUSTOMER_ORIGIN) {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return fallback;
}

/**
 * Confirm-email must not keep a signup on the admin origin.
 * Forgot-password / recovery stays on the current host (admin /reset-password is fine).
 */
export function confirmEmailRedirectTo({
  origin = currentOrigin(),
  hostname,
  surface,
  adminAppUrl,
} = {}) {
  if (isAdminSignupLockedSurface({ hostname, surface, adminAppUrl })) {
    return DEFAULT_CUSTOMER_ORIGIN;
  }
  return origin;
}

export function resetPasswordRedirectTo({
  origin = currentOrigin(),
} = {}) {
  return `${origin}/reset-password`;
}
