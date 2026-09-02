/** Client dashboard tabs. URL `?tab=` must stay in lockstep with React state. */

export const CLIENT_TABS = ["today", "meals", "messages", "progress"];

export function tabFromSearch(search) {
  const q = new URLSearchParams(typeof search === "string" ? search : String(search || "")).get("tab");
  return CLIENT_TABS.includes(q) ? q : "today";
}

/** Write `?tab=` without dropping other query params. No-op when already current. */
export function writeClientTab(tab) {
  if (typeof window === "undefined") return;
  if (!CLIENT_TABS.includes(tab)) return;
  const url = new URL(window.location.href);
  if (url.searchParams.get("tab") === tab) return;
  url.searchParams.set("tab", tab);
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}
