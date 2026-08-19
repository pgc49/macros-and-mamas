import { isAdminSignupLockedHost } from "../../functions/_shared/adminOrigin.js";
import { CONFIG } from "../config";

export const ADMIN_SIGNUP_DISABLED_MESSAGE =
  "Account creation is not available on the admin app.";

/**
 * Admin Pages (`APP_SURFACE=admin`), admin.macrosandmamas.com, and admin
 * preview hosts must never offer or complete create-account.
 */
export function isAdminSignupLockedSurface({
  surface = import.meta.env.VITE_APP_SURFACE || "combined",
  hostname,
  adminAppUrl = CONFIG.ADMIN_APP_URL,
} = {}) {
  if (surface === "admin") return true;
  const host = hostname
    ?? (typeof window !== "undefined" ? window.location.hostname : "");
  return isAdminSignupLockedHost(host, { VITE_ADMIN_APP_URL: adminAppUrl });
}

export function blockedAdminSignupResult() {
  return {
    error: { message: ADMIN_SIGNUP_DISABLED_MESSAGE },
    needsEmailConfirm: false,
  };
}
