import { isAdminSignupLockedHost } from "./adminOrigin.js";

/** Isolated customer / quiz / join origin. Admin never hosts enrollment. */
export const DEFAULT_CUSTOMER_ORIGIN = "https://www.macrosandmamas.com";

function canonicalPathname(pathname) {
  const p = String(pathname || "");
  if (p.length > 1 && /\/+$/.test(p)) return p.replace(/\/+$/, "") || "/";
  return p || "/";
}

export function customerOriginFromEnv(env) {
  const raw = String(env?.VITE_APP_URL || env?.APP_URL || DEFAULT_CUSTOMER_ORIGIN).trim();
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) {
      return DEFAULT_CUSTOMER_ORIGIN;
    }
    if (isAdminSignupLockedHost(url.hostname, env)) return DEFAULT_CUSTOMER_ORIGIN;
    return url.origin;
  } catch {
    return DEFAULT_CUSTOMER_ORIGIN;
  }
}

/**
 * Customer pay-funnel routes that must not stay on the admin origin:
 * /join, /welcome (Stripe return), and quiz handoff (/signin?from=quiz).
 */
export function isCustomerEnrollmentPath(pathname, search) {
  const path = canonicalPathname(pathname);
  if (path === "/join" || path === "/welcome") return true;
  if (path === "/signin") {
    const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
    return params.get("from") === "quiz";
  }
  return false;
}

export function customerEnrollmentUrl(pathname, search = "", hash = "", origin = DEFAULT_CUSTOMER_ORIGIN) {
  const path = String(pathname || "").startsWith("/") ? pathname : `/${pathname || ""}`;
  const q = !search ? "" : search.startsWith("?") ? search : `?${search}`;
  const h = !hash ? "" : hash.startsWith("#") ? hash : `#${hash}`;
  return `${origin}${path}${q}${h}`;
}

/**
 * Absolute www URL when this request is an admin-host enrollment page.
 * Otherwise null (www / sign-in / reset-password /admin stay put).
 */
export function adminToCustomerRedirectUrl(href, env) {
  let url;
  try {
    url = href instanceof URL ? href : new URL(String(href || ""));
  } catch {
    return null;
  }
  if (!isAdminSignupLockedHost(url.hostname, env)) return null;
  if (!isCustomerEnrollmentPath(url.pathname, url.search)) return null;
  return customerEnrollmentUrl(
    url.pathname,
    url.search,
    url.hash,
    customerOriginFromEnv(env),
  );
}
