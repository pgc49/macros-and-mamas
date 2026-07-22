import { DEFAULT_ITEMS, DAYS } from "../content/data";
import { addDaysIso, fmtRange, localDateIso, wkStartOf } from "./dates";

/** Checklist adherence % for one week of checkins. */
export function adherenceForWeek(checksByWeek, wk) {
  const ch = checksByWeek[wk] || {};
  let done = 0;
  let total = 0;
  DEFAULT_ITEMS.forEach((it) => {
    if (it.daily) {
      DAYS.forEach((d) => {
        total += 1;
        if (ch[`${it.id}|${d}`]) done += 1;
      });
    } else {
      total += 3;
      const sc = DAYS.filter((d) => ch[`${it.id}|${d}`]).length;
      done += Math.min(sc, 3);
    }
  });
  return total ? Math.round((done / total) * 100) : 0;
}

export function weekKeysFromChecks(checksByWeek, curWk = wkStartOf()) {
  const ks = new Set([...Object.keys(checksByWeek || {}), curWk]);
  return [...ks].sort();
}

export function progWeekNum(wk, earliestWk) {
  return Math.round((new Date(wk) - new Date(earliestWk)) / (7 * 86400000)) + 1;
}

/** Daily macro totals for Progress charts (logged days only, last ~28 days). */
export function buildMacroHistory(mealHistoryByDate, days = 28) {
  const today = localDateIso();
  const start = addDaysIso(today, -(Math.max(1, days) - 1));
  const rows = [];
  Object.keys(mealHistoryByDate || {})
    .filter((d) => d >= start && d <= today)
    .sort()
    .forEach((d) => {
      const entries = mealHistoryByDate[d] || [];
      if (!entries.length) return;
      const tot = entries.reduce(
        (a, e) => ({
          cal: a.cal + (Number(e.cal) || 0),
          p: a.p + (Number(e.p) || 0),
          c: a.c + (Number(e.c) || 0),
          f: a.f + (Number(e.f) || 0),
        }),
        { cal: 0, p: 0, c: 0, f: 0 },
      );
      rows.push({
        date: d,
        label: d.slice(5),
        ...tot,
      });
    });
  return rows;
}

/** Weekly habit adherence series for Progress chart. */
export function buildHabitHistory(checksByWeek, curWk = wkStartOf()) {
  const wkKeys = weekKeysFromChecks(checksByWeek, curWk);
  const earliestWk = wkKeys[0];
  return wkKeys.map((w) => ({
    week: w,
    label: `W${progWeekNum(w, earliestWk)}`,
    pct: adherenceForWeek(checksByWeek, w),
    rangeLabel: fmtRange(w),
  }));
}

/** 4-week trends summary used on the Progress tab. */
export function buildTrends(checksByWeek, curWk = wkStartOf()) {
  const wkKeys = weekKeysFromChecks(checksByWeek, curWk);
  const weeks = wkKeys.filter((w) => Object.keys(checksByWeek[w] || {}).length > 0 || w === curWk);
  const n = weeks.length;
  if (n < 4) return { locked: true, n };

  const overall = weeks.map((w) => adherenceForWeek(checksByWeek, w));
  const half = Math.floor(n / 2);
  const avg = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  const delta = avg(overall.slice(half)) - avg(overall.slice(0, half));

  const items = DEFAULT_ITEMS.map((it) => {
    if (it.daily) {
      let hits = 0;
      weeks.forEach((w) => {
        const ch = checksByWeek[w] || {};
        DAYS.forEach((d) => {
          if (ch[`${it.id}|${d}`]) hits += 1;
        });
      });
      return { label: it.label, pct: Math.round((hits / (7 * n)) * 100), strength: false };
    }
    let sessions = 0;
    weeks.forEach((w) => {
      const ch = checksByWeek[w] || {};
      sessions += DAYS.filter((d) => ch[`${it.id}|${d}`]).length;
    });
    return { label: it.label, avgSessions: sessions / n, strength: true };
  });

  const dailyItems = items.filter((i) => !i.strength);
  const best = [...dailyItems].sort((a, b) => b.pct - a.pct)[0];
  const worst = [...dailyItems].sort((a, b) => a.pct - b.pct)[0];
  return { locked: false, n, overall, delta, items, best, worst };
}
