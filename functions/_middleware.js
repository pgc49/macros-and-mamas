/**
 * Canonical host: apex → www (preserve path + query, including fbclid).
 * Pages `_redirects` host rules were not firing while both domains are attached.
 */
export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.hostname === "macrosandmamas.com") {
    url.hostname = "www.macrosandmamas.com";
    return Response.redirect(url.toString(), 301);
  }
  return context.next();
}
