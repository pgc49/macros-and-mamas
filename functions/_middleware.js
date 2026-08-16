/**
 * Canonical host: apex → www (preserve path + query, including fbclid).
 * Pages `_redirects` host rules were not firing while both domains are attached.
 *
 * After admin.macrosandmamas.com is live, www (and apex) /admin go to that
 * origin so Callie bookmarks and old links leave the customer app.
 */
const CUSTOMER_HOSTS = new Set(["www.macrosandmamas.com", "macrosandmamas.com"]);
const DEFAULT_ADMIN_ORIGIN = "https://admin.macrosandmamas.com";

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

export function isAdminPath(pathname) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const adminOrigin = adminOriginFromEnv(context.env);
  let adminHost = "admin.macrosandmamas.com";
  try {
    adminHost = new URL(adminOrigin).hostname;
  } catch {
    /* keep default */
  }

  if (url.hostname !== adminHost && CUSTOMER_HOSTS.has(url.hostname) && isAdminPath(url.pathname)) {
    return Response.redirect(`${adminOrigin}${url.pathname}${url.search}`, 302);
  }

  if (url.hostname === "macrosandmamas.com") {
    url.hostname = "www.macrosandmamas.com";
    return Response.redirect(url.toString(), 301);
  }
  return context.next();
}
