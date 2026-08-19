import { hostnameFromOriginOrHost, isAdminSignupLockedHost } from "./adminOrigin.js";
import { customerOriginFromEnv } from "./customerOrigin.js";

function requestUrlAndHost(requestOrUrl) {
  if (typeof requestOrUrl === "string" || requestOrUrl instanceof URL) {
    const url = new URL(requestOrUrl);
    return { url, host: url.hostname };
  }
  const url = new URL(requestOrUrl.url);
  const host = hostnameFromOriginOrHost(requestOrUrl.headers?.get?.("host") || "") || url.hostname;
  return { url, host };
}

/**
 * Stripe return URLs follow the request origin on www / preview / localhost.
 * Admin host (and admin Pages previews) must send people to www — never
 * `${adminOrigin}/welcome` or `${adminOrigin}/join`.
 */
export function checkoutAppOrigin(requestOrUrl, env) {
  const { url, host } = requestUrlAndHost(requestOrUrl);
  if (isAdminSignupLockedHost(url.hostname, env) || isAdminSignupLockedHost(host, env)) {
    return customerOriginFromEnv(env);
  }
  return url.origin;
}

export function checkoutRedirectUrls(requestOrUrl, env) {
  const origin = checkoutAppOrigin(requestOrUrl, env);
  return {
    success_url: `${origin}/welcome?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/join`,
    eventSourceUrl: `${origin}/join`,
  };
}
