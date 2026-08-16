/**
 * Canonical host: apex → www (preserve path + query, including fbclid).
 * Pages `_redirects` host rules were not firing while both domains are attached.
 *
 * After admin.macrosandmamas.com is live, www (and apex) /admin go to that
 * origin so Callie bookmarks and old links leave the customer app.
 */
import { adminOriginFromEnv } from "./_shared/adminOrigin.js";

const CUSTOMER_HOSTS = new Set(["www.macrosandmamas.com", "macrosandmamas.com"]);

export { adminOriginFromEnv };

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
