/** Lightweight decide-funnel events. No existing analytics bus — CustomEvent + console in DEV. */

export function decideTrack(name, payload = {}) {
  const detail = { name, at: Date.now(), ...payload };
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("mm-decide", { detail }));
    if (import.meta.env?.DEV) {
      console.info("[decide]", name, payload);
    }
  }
  return detail;
}

function sessionKey(dateKey, slot) {
  return `mm_decide_v1:${dateKey}:${slot}`;
}

export function loadDecideSession(dateKey, slot) {
  if (typeof sessionStorage === "undefined" || !dateKey || !slot) return null;
  try {
    const raw = sessionStorage.getItem(sessionKey(dateKey, slot));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveDecideSession(dateKey, slot, state) {
  if (typeof sessionStorage === "undefined" || !dateKey || !slot) return;
  try {
    sessionStorage.setItem(sessionKey(dateKey, slot), JSON.stringify(state));
  } catch {
    /* quota */
  }
}

const snackMem = new Map();

function snackKey(dateKey) {
  return `mm_decide_snack_v1:${dateKey}`;
}

function clampSnackCount(n, fallback = 0) {
  const count = Math.round(Number(n));
  if (!Number.isFinite(count)) return fallback;
  return Math.max(0, Math.min(4, count));
}

/** Day-level snack room. Off by default; survives refine remounts. */
export function loadDecideSnackCount(dateKey, fallback = 0) {
  if (!dateKey) return fallback;
  if (snackMem.has(dateKey)) return snackMem.get(dateKey);
  if (typeof sessionStorage === "undefined") return fallback;
  try {
    const raw = sessionStorage.getItem(snackKey(dateKey));
    if (raw == null) return fallback;
    const n = clampSnackCount(raw, fallback);
    snackMem.set(dateKey, n);
    return n;
  } catch {
    return fallback;
  }
}

export function resetDecideSnackCounts() {
  snackMem.clear();
  if (typeof sessionStorage === "undefined") return;
  try {
    const keys = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith("mm_decide_snack_v1:")) keys.push(k);
    }
    keys.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

export function saveDecideSnackCount(dateKey, count) {
  if (!dateKey) return;
  const n = clampSnackCount(count, 0);
  snackMem.set(dateKey, n);
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(snackKey(dateKey), String(n));
  } catch {
    /* quota */
  }
}

export function clearDecideSession(dateKey, slot) {
  if (typeof sessionStorage === "undefined" || !dateKey) return;
  if (slot) {
    sessionStorage.removeItem(sessionKey(dateKey, slot));
    return;
  }
  const prefix = `mm_decide_v1:${dateKey}:`;
  const keys = [];
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const k = sessionStorage.key(i);
    if (k && k.startsWith(prefix)) keys.push(k);
  }
  keys.forEach((k) => sessionStorage.removeItem(k));
}
