/**
 * Recover from Vite/CF Pages deploy races where a hashed chunk 404s or
 * briefly returns the SPA HTML shell (MIME text/html) instead of JS.
 * One automatic reload per tab session; then show the inline #mam-boot-fail UI.
 */
const RELOAD_KEY = "mam-boot-reload";

function alreadyReloaded() {
  try {
    return sessionStorage.getItem(RELOAD_KEY) === "1";
  } catch {
    return false;
  }
}

function markReloaded() {
  try {
    sessionStorage.setItem(RELOAD_KEY, "1");
  } catch {
    /* private / quota */
  }
}

export function clearBootReloadFlag() {
  try {
    sessionStorage.removeItem(RELOAD_KEY);
  } catch {
    /* ignore */
  }
}

function showBootFail(detail) {
  const el = document.getElementById("mam-boot-fail");
  const detailEl = document.getElementById("mam-boot-fail-detail");
  if (detailEl && detail) detailEl.textContent = String(detail).slice(0, 240);
  if (el) el.hidden = false;
  const loading = document.getElementById("mam-boot-loading");
  if (loading) loading.hidden = true;
}

function tryReloadOnce(reason) {
  if (alreadyReloaded()) {
    showBootFail(reason);
    return;
  }
  markReloaded();
  window.location.reload();
}

/** Call once from main.jsx before React mounts. */
export function installBootRecovery() {
  if (typeof window === "undefined") return;

  window.addEventListener("vite:preloadError", (event) => {
    try {
      event.preventDefault();
    } catch {
      /* older browsers */
    }
    tryReloadOnce("A page chunk failed to load after a deploy.");
  });

  window.addEventListener(
    "error",
    (event) => {
      const t = event?.target;
      if (t && (t.tagName === "SCRIPT" || t.tagName === "LINK")) {
        tryReloadOnce("A required script or stylesheet failed to load.");
      }
    },
    true,
  );
}
