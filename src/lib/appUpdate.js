/**
 * Home-screen / PWA update detection.
 * Client bakes a build id at Vite build time; /api/app-version returns the
 * currently deployed id (+ optional release notes).
 *
 * Mismatch → amber “App update ready” (refresh only — no release-note bullets).
 * Matched + unread notes → sage “What’s new” once; Got it writes
 * localStorage mm_release_notes_seen = notes.id.
 */

export const APP_BUILD_ID = String(
  import.meta.env.VITE_APP_BUILD_ID
  || import.meta.env.CF_PAGES_COMMIT_SHA
  || "dev",
).trim() || "dev";

const SESSION_DISMISS_KEY = "mm_update_banner_dismissed";
const SEEN_NOTES_KEY = "mm_release_notes_seen";

export function wasUpdateDismissedThisSession(remoteBuildId) {
  try {
    return sessionStorage.getItem(SESSION_DISMISS_KEY) === String(remoteBuildId || "");
  } catch {
    return false;
  }
}

export function dismissUpdateThisSession(remoteBuildId) {
  try {
    sessionStorage.setItem(SESSION_DISMISS_KEY, String(remoteBuildId || ""));
  } catch {
    /* private mode */
  }
}

export function hasSeenReleaseNotes(notesId) {
  if (!notesId) return true;
  try {
    return localStorage.getItem(SEEN_NOTES_KEY) === String(notesId);
  } catch {
    return false;
  }
}

export function markReleaseNotesSeen(notesId) {
  if (!notesId) return;
  try {
    localStorage.setItem(SEEN_NOTES_KEY, String(notesId));
  } catch {
    /* private mode */
  }
}

/** Normalize release-notes payload from /api/app-version. */
export function normalizeReleaseNotes(raw) {
  if (!raw || typeof raw !== "object") return null;
  const headline = String(raw.headline || "").trim();
  const bullets = Array.isArray(raw.bullets)
    ? raw.bullets.map((b) => String(b || "").trim()).filter(Boolean).slice(0, 5)
    : [];
  if (!bullets.length) return null;
  const id = String(raw.id || "").trim() || `notes-${bullets.join("|").slice(0, 48)}`;
  return {
    id,
    headline: headline || "What’s new",
    bullets,
  };
}

/**
 * Fetch deployed build id + optional release notes.
 * Returns null on network/parse failure.
 */
export async function fetchRemoteAppVersion() {
  try {
    const resp = await fetch(`/api/app-version?t=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!resp.ok) return null;
    const data = await resp.json().catch(() => null);
    const buildId = String(data?.buildId || "").trim();
    if (!buildId || buildId === "unknown") return null;
    return {
      buildId,
      notes: normalizeReleaseNotes(data?.notes),
    };
  } catch {
    return null;
  }
}

/** @deprecated use fetchRemoteAppVersion — kept for any stray imports */
export async function fetchRemoteBuildId() {
  const v = await fetchRemoteAppVersion();
  return v?.buildId || null;
}

/** True when this page load came from Update app’s hard reload. */
export function consumePostUpdateFlag() {
  if (typeof window === "undefined") return false;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("_refresh")) return false;
    url.searchParams.delete("_refresh");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    return true;
  } catch {
    return false;
  }
}

/**
 * Hard reload that busts sticky home-screen caches as much as browsers allow.
 */
export async function hardReloadApp() {
  try {
    if (typeof caches !== "undefined" && caches.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* ignore */
  }
  const url = new URL(window.location.href);
  url.searchParams.set("_refresh", String(Date.now()));
  window.location.replace(url.toString());
}
