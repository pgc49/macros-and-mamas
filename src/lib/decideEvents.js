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
