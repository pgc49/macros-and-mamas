import { DAYS } from "../content/data";
import { adherenceForItems, programGoalItems } from "../lib/goals";
import { addDaysIso, fmtRange, localDateIso, wkStartOf } from "./dates";

/** Checklist adherence % for one week of checkins (program + optional custom items). */
export function adherenceForWeek(checksByWeek, wk, items = null) {
  return adherenceForItems(checksByWeek, wk, items || programGoalItems());
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

/** Daily water totals for Progress chart (logged days only, last ~28 days). */
export function buildWaterHistory(waterLogsByDate, goalOz, days = 28) {
  const today = localDateIso();
  const start = addDaysIso(today, -(Math.max(1, days) - 1));
  const goal = Number(goalOz) || 0;
  const rows = [];
  Object.keys(waterLogsByDate || {})
    .filter((d) => d >= start && d <= today)
    .sort()
    .forEach((d) => {
      const entries = waterLogsByDate[d] || [];
      if (!entries.length) return;
      const oz = entries.reduce((s, e) => s + (Number(e.oz) || 0), 0);
      rows.push({
        date: d,
        label: d.slice(5),
        oz: Math.round(oz),
        hit: goal > 0 && oz >= goal,
      });
    });
  return rows;
}

/** Weekly habit adherence series for Progress chart. */
export function buildHabitHistory(checksByWeek, curWk = wkStartOf(), goalItems = null) {
  const list = goalItems || programGoalItems();
  const wkKeys = weekKeysFromChecks(checksByWeek, curWk);
  const earliestWk = wkKeys[0];
  return wkKeys.map((w) => ({
    week: w,
    label: `W${progWeekNum(w, earliestWk)}`,
    pct: adherenceForWeek(checksByWeek, w, list),
    rangeLabel: fmtRange(w),
  }));
}

/** 4-week trends summary used on the Progress tab. */
export function buildTrends(checksByWeek, curWk = wkStartOf(), goalItems = null) {
  const list = goalItems || programGoalItems();
  const wkKeys = weekKeysFromChecks(checksByWeek, curWk);
  const weeks = wkKeys.filter((w) => Object.keys(checksByWeek[w] || {}).length > 0 || w === curWk);
  const n = weeks.length;
  if (n < 4) return { locked: true, n };

  const overall = weeks.map((w) => adherenceForWeek(checksByWeek, w, list));
  const half = Math.floor(n / 2);
  const avg = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  const delta = avg(overall.slice(half)) - avg(overall.slice(0, half));

  const items = list.map((it) => {
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
    return {
      label: it.label,
      avgSessions: sessions / n,
      strength: true,
      nTarget: Number(it.nTarget) || 3,
    };
  });

  const dailyItems = items.filter((i) => !i.strength);
  const best = [...dailyItems].sort((a, b) => b.pct - a.pct)[0];
  const worst = [...dailyItems].sort((a, b) => a.pct - b.pct)[0];
  return { locked: false, n, overall, delta, items, best, worst };
}
