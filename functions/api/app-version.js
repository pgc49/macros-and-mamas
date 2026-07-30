/* ==================================================================
   /functions/api/app-version.js
   Uncached build id for home-screen update checks.
   ================================================================== */

export async function onRequestGet({ env }) {
  const buildId = String(
    env.CF_PAGES_COMMIT_SHA
    || env.VITE_APP_BUILD_ID
    || "unknown",
  ).trim() || "unknown";

  return new Response(JSON.stringify({ buildId }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store, max-age=0",
    },
  });
}
