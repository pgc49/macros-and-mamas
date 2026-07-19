/* ---- date + rate helpers (used by client app and admin portal) ---- */
export const wkStartOf = (d = new Date()) => {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday start
  x.setDate(x.getDate() - day);
  return x.toISOString().slice(0, 10);
};
export const addDaysIso = (iso, n) => new Date(new Date(iso + "T12:00:00").getTime() + n * 86400000).toISOString().slice(0, 10);
export const fmtRange = (wk) => {
  const f = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${f(wk)} – ${f(addDaysIso(wk, 6))}`;
};
export const rateOf = (arr) => {
  if (!arr || arr.length < 2) return null;
  const first = arr[0], last = arr[arr.length - 1];
  const days = (new Date(last.date) - new Date(first.date)) / 86400000;
  if (days < 5) return null;
  return ((first.w - last.w) / days) * 7;
};
