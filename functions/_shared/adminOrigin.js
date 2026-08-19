/** Isolated coach origin. Customer/www never hosts /admin. */
export const DEFAULT_ADMIN_ORIGIN = "https://admin.macrosandmamas.com";
export const DEFAULT_ADMIN_HOST = "admin.macrosandmamas.com";

/** Cloudflare Pages project for the isolated admin surface. */
export const ADMIN_PAGES_DEV_HOST = "macros-and-mamas-admin.pages.dev";

export function adminOriginFromEnv(env) {
  const raw = String(env?.VITE_ADMIN_APP_URL || env?.ADMIN_APP_URL || DEFAULT_ADMIN_ORIGIN).trim();
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return DEFAULT_ADMIN_ORIGIN;
    return url.origin;
  } catch {
    return DEFAULT_ADMIN_ORIGIN;
  }
}

export function adminPortalUrl(env) {
  return `${adminOriginFromEnv(env)}/admin`;
}

export function hostnameFromOriginOrHost(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    if (raw.includes("://")) return new URL(raw).hostname.toLowerCase();
    return raw.split("/")[0].split(":")[0].toLowerCase();
  } catch {
    return "";
  }
}

export function isAdminPagesPreviewHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host === ADMIN_PAGES_DEV_HOST || host.endsWith(`.${ADMIN_PAGES_DEV_HOST}`);
}

/**
 * True for the production admin host, configured admin origin, and admin
 * Pages preview hosts. Customer www / quiz / join hosts stay false.
 */
export function isAdminSignupLockedHost(hostname, env) {
  const host = hostnameFromOriginOrHost(hostname);
  if (!host) return false;
  let configured = DEFAULT_ADMIN_HOST;
  try {
    configured = new URL(adminOriginFromEnv(env)).hostname.toLowerCase();
  } catch {
    configured = DEFAULT_ADMIN_HOST;
  }
  return host === configured || host === DEFAULT_ADMIN_HOST || isAdminPagesPreviewHost(host);
}
