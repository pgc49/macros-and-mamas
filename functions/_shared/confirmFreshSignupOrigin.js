/**
 * /api/confirm-fresh-signup has no JWT — the service role confirms a fresh
 * unconfirmed user if the caller knows the email. Origin is not auth, but it
 * is the only browser gate. Keep it exact: www + named customer previews.
 * Never allow admin, and never use a *.pages.dev wildcard.
 */
import {
  hostnameFromOriginOrHost,
  isAdminSignupLockedHost,
} from "./adminOrigin.js";

export const CONFIRM_FRESH_SIGNUP_WWW_HOST = "www.macrosandmamas.com";

/** Cloudflare Pages project for the customer / quiz / join surface. */
export const CUSTOMER_PAGES_DEV_HOST = "macros-and-mamas.pages.dev";

/**
 * Explicit named customer preview hosts. Hash deployments
 * (`abc123.macros-and-mamas.pages.dev`) and foreign `*.pages.dev` projects
 * are not listed and must stay rejected.
 */
export const NAMED_CUSTOMER_PREVIEW_HOSTS = Object.freeze([
  CUSTOMER_PAGES_DEV_HOST,
  "preview.macros-and-mamas.pages.dev",
]);

const CUSTOMER_PAGES_DEV_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function extraConfirmFreshSignupHosts(env) {
  const raw = String(env?.CONFIRM_FRESH_SIGNUP_ALLOWED_HOSTS || "").trim();
  if (!raw) return [];
  return raw.split(",").map((part) => part.trim().toLowerCase()).filter(Boolean);
}

export function isNamedCustomerPreviewHost(hostname, env) {
  const host = String(hostname || "").toLowerCase();
  if (!host) return false;
  if (NAMED_CUSTOMER_PREVIEW_HOSTS.includes(host)) return true;
  if (!extraConfirmFreshSignupHosts(env).includes(host)) return false;
  if (host === CUSTOMER_PAGES_DEV_HOST) return true;
  if (!host.endsWith(`.${CUSTOMER_PAGES_DEV_HOST}`)) return false;
  const label = host.slice(0, -(`.${CUSTOMER_PAGES_DEV_HOST}`).length);
  return CUSTOMER_PAGES_DEV_LABEL.test(label) && !label.includes(".");
}

export function isConfirmFreshSignupAllowedHost(hostname, env) {
  const host = hostnameFromOriginOrHost(hostname);
  if (!host || isAdminSignupLockedHost(host, env)) return false;
  if (host === CONFIRM_FRESH_SIGNUP_WWW_HOST) return true;
  return isNamedCustomerPreviewHost(host, env);
}

function isHttpsOrigin(raw) {
  try {
    const url = new URL(String(raw || "").trim());
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function originAllowed(request, env) {
  const requestHost = hostnameFromOriginOrHost(request.url);
  const originRaw = request.headers.get("origin") || "";
  const originHost = hostnameFromOriginOrHost(originRaw);
  const hostHeader = hostnameFromOriginOrHost(request.headers.get("host") || "");
  if (
    isAdminSignupLockedHost(requestHost, env)
    || isAdminSignupLockedHost(originHost, env)
    || isAdminSignupLockedHost(hostHeader, env)
  ) {
    return false;
  }

  if (originRaw) {
    if (!isHttpsOrigin(originRaw)) return false;
    if (originHost !== requestHost) return false;
    return isConfirmFreshSignupAllowedHost(originHost, env);
  }

  return isConfirmFreshSignupAllowedHost(requestHost, env);
}
