/**
 * Home-screen / PWA update detection.
 * Client bakes a build id at Vite build time; /api/app-version returns the
 * currently deployed id (no-store). Mismatch → show Update banner.
 */

export const APP_BUILD_ID = String(
  import.meta.env.VITE_APP_BUILD_ID
  || import.meta.env.CF_PAGES_COMMIT_SHA
  || "dev",
).trim() || "dev";

const SESSION_DISMISS_KEY = "mm_update_banner_dismissed";

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

/** Fetch deployed build id. Returns null on network/parse failure. */
export async function fetchRemoteBuildId() {
  try {
    const resp = await fetch(`/api/app-version?t=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!resp.ok) return null;
    const data = await resp.json().catch(() => null);
    const id = String(data?.buildId || "").trim();
    if (!id || id === "unknown") return null;
    return id;
  } catch {
    return null;
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
