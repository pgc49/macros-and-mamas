/* ---- date + rate helpers (used by client app and admin portal) ---- */

/** Local calendar YYYY-MM-DD — avoids UTC drift from toISOString(). */
export function localDateIso(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse YYYY-MM-DD as local midday (stable across DST). */
export function parseLocalDate(iso) {
  return new Date(`${iso}T12:00:00`);
}

export const wkStartOf = (d = new Date()) => {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday start
  x.setDate(x.getDate() - day);
  return localDateIso(x);
};

export const addDaysIso = (iso, n) => {
  const x = parseLocalDate(iso);
  x.setDate(x.getDate() + n);
  return localDateIso(x);
};

export const fmtRange = (wk) => {
  const f = (iso) => parseLocalDate(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${f(wk)} – ${f(addDaysIso(wk, 6))}`;
};

export const rateOf = (arr) => {
  if (!arr || arr.length < 2) return null;
  const first = arr[0], last = arr[arr.length - 1];
  const days = (new Date(last.date) - new Date(first.date)) / 86400000;
  if (days < 5) return null;
  return ((first.w - last.w) / days) * 7;
};

/** "Monday, Jul 20" */
export function formatLongDay(iso) {
  return parseLocalDate(iso).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export function isTodayIso(iso) {
  return iso === localDateIso();
}

/** Relative label: Today / Yesterday / Tomorrow / null */
export function dayRelationLabel(iso) {
  const today = localDateIso();
  if (iso === today) return "Today";
  if (iso === addDaysIso(today, -1)) return "Yesterday";
  if (iso === addDaysIso(today, 1)) return "Tomorrow";
  return null;
}

/** Weekday key matching DAYS in content/data (Mon-start). */
export function weekdayKey(iso = localDateIso()) {
  const keys = ["M", "T", "W", "T2", "F", "S", "S2"];
  return keys[(parseLocalDate(iso).getDay() + 6) % 7];
}
