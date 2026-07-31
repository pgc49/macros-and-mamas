/* ==================================================================
   /functions/api/app-version.js
   Uncached build id (+ optional release notes) for home-screen update checks.
   ================================================================== */

import { APP_RELEASE_NOTES } from "../_shared/releaseNotes.js";

function notesPayload() {
  const id = String(APP_RELEASE_NOTES?.id || "").trim();
  const headline = String(APP_RELEASE_NOTES?.headline || "").trim();
  const bullets = Array.isArray(APP_RELEASE_NOTES?.bullets)
    ? APP_RELEASE_NOTES.bullets.map((b) => String(b || "").trim()).filter(Boolean).slice(0, 5)
    : [];
  if (!bullets.length) return null;
  return {
    id: id || `notes-${bullets.length}`,
    headline: headline || "What’s new",
    bullets,
  };
}

export async function onRequestGet({ env }) {
  const buildId = String(
    env.CF_PAGES_COMMIT_SHA
    || env.VITE_APP_BUILD_ID
    || "unknown",
  ).trim() || "unknown";

  const notes = notesPayload();

  return new Response(JSON.stringify({
    buildId,
    ...(notes ? { notes } : {}),
  }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store, max-age=0",
    },
  });
}
