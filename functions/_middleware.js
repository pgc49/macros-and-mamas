/**
 * Canonical host: apex → www (preserve path + query, including fbclid).
 * Pages `_redirects` host rules were not firing while both domains are attached.
 *
 * After admin.macrosandmamas.com is live, www (and apex) /admin go to that
 * origin so Callie bookmarks and old links leave the customer app.
 *
 * Admin origin is sign-in + reset-password + /admin only. /join, quiz
 * handoff (?from=quiz), and checkout return (/welcome) 302 to www.
 */
import { adminOriginFromEnv } from "./_shared/adminOrigin.js";
import { adminToCustomerRedirectUrl } from "./_shared/customerOrigin.js";

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

  const enrollmentRedirect = adminToCustomerRedirectUrl(url, context.env);
  if (enrollmentRedirect) {
    return Response.redirect(enrollmentRedirect, 302);
  }

  return context.next();
}
