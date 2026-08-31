/**
 * Build the OpenRouter payload for a per-client summary.
 * v1: no DM bodies, no photos, no group posts, no full profiles dump.
 */
import { buildHabitRhythm, goalChipLabel } from "../lib/habitRhythm";
import {
  assertNoMessageBodies,
  CLIENT_SUMMARY_HINT,
} from "../../functions/_shared/clientSummaryGuard.js";

export { assertNoMessageBodies, CLIENT_SUMMARY_HINT };

export function buildClientSummaryPayload({
  client,
  progress,
  weighins = [],
  macros = null,
} = {}) {
  const rhythm = buildHabitRhythm({
    checksByWeek: progress?.checksByWeek || {},
    goalItems: progress?.goalItems || [],
    programStartWeek: progress?.programStartWeek || null,
  });

  const meals = [];
  const byDate = progress?.mealHistoryByDate || {};
  Object.keys(byDate).sort().slice(-28).forEach((date) => {
    const rows = byDate[date] || [];
    const tot = rows.reduce(
      (a, e) => ({
        cal: a.cal + (Number(e.cal) || 0),
        p: a.p + (Number(e.p) || 0),
        c: a.c + (Number(e.c) || 0),
        f: a.f + (Number(e.f) || 0),
        n: a.n + 1,
      }),
      { cal: 0, p: 0, c: 0, f: 0, n: 0 },
    );
    if (tot.n) meals.push({ date, ...tot });
  });

  const water = Object.entries(progress?.waterLogsByDate || {})
    .map(([date, rows]) => {
      const list = Array.isArray(rows) ? rows : [{ oz: rows }];
      const oz = list.reduce((s, r) => s + (Number(r?.oz) || 0), 0);
      return { date, oz };
    })
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-28);

  return {
    firstName: String(client?.name || "").trim().split(/\s+/)[0] || "Mama",
    week: client?.programWeek ?? null,
    lastActive: client?.lastActiveDate || client?.lastMealDate || null,
    ranges: macros ? {
      cal: macros.cal,
      protein: macros.protein,
      carbs: macros.carbs,
      fat: macros.fat,
    } : null,
    meals,
    water,
    weighins: (weighins || []).slice(-12).map((w) => ({
      date: w.date,
      w: Number(w.w ?? w.weight),
    })),
    steadiestHabit: rhythm.steadiest ? goalChipLabel(rhythm.steadiest) : null,
    habitWeeks: (rhythm.allSeries || []).slice(-6).map((r) => ({
      label: r.label,
      pct: r.pct,
    })),
  };
}
