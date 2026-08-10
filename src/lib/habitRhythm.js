/**
 * Progress-tab habit rhythm (Stage 5.7).
 * Bars per week, filterable by goal; current week uses elapsed-day denominator.
 */
import {
  dayIndex,
  goalChecksThisWeek,
  goalWeekTarget,
  programGoalItems,
} from "./goals";
import { addDaysIso, localDateIso, parseLocalDate, weekdayKey, wkStartOf } from "../utils/dates";

/** Mon=1 … through today; completed weeks = 7; future = 0. */
export function daysElapsedInWeek(weekStart, todayIso = null) {
  const today = todayIso || localDateIso();
  const todayWk = wkStartOf(parseLocalDate(today));
  if (weekStart > todayWk) return 0;
  if (weekStart < todayWk) return 7;
  return dayIndex(weekdayKey(today)) + 1;
}

/** Contiguous Mon weeks from earliest → current (includes empty weeks). */
export function weeksInclusive(earliestWk, curWk) {
  const start = earliestWk || curWk;
  const end = curWk || start;
  if (!start || !end || start > end) return [end].filter(Boolean);
  const out = [];
  let w = start;
  let guard = 0;
  while (w <= end && guard < 120) {
    out.push(w);
    w = addDaysIso(w, 7);
    guard += 1;
  }
  return out;
}

export function earliestWeekFromChecks(checksByWeek, curWk) {
  const keys = Object.keys(checksByWeek || {}).sort();
  if (!keys.length) return curWk;
  return keys[0] < curWk ? keys[0] : curWk;
}

/** False when a custom goal did not exist yet in that week. */
export function goalActiveInWeek(item, weekStart) {
  if (!item || item.source !== "custom" || !item.createdAt) return true;
  const created = String(item.createdAt).slice(0, 10);
  const weekEnd = addDaysIso(weekStart, 6);
  return created <= weekEnd;
}

/**
 * Effective target for % math.
 * Current week daily → min(weekTarget, daysElapsed).
 * n_per_week keeps n_target (spec).
 */
export function effectiveTarget(item, weekStart, { isCurrentWeek, elapsed }) {
  const base = goalWeekTarget(item, weekStart);
  if (base <= 0) return 0;
  if (!item.daily) return base;
  if (isCurrentWeek) return Math.min(base, Math.max(1, elapsed));
  return base;
}

export function goalWeekStats(item, checks, weekStart, { isCurrentWeek, elapsed }) {
  if (!goalActiveInWeek(item, weekStart)) {
    return { active: false, hits: 0, target: 0, pct: null };
  }
  const target = effectiveTarget(item, weekStart, { isCurrentWeek, elapsed });
  if (target <= 0) return { active: false, hits: 0, target: 0, pct: null };
  const hits = goalChecksThisWeek(checks, item.id);
  const pct = Math.min(Math.round((hits / target) * 100), 100);
  return { active: true, hits, target, pct };
}

/**
 * Build rhythm model for HabitRhythmCard.
 * @returns {{ weeks, goals, allSeries, byGoalId, insightAll }}
 */
export function buildHabitRhythm({
  checksByWeek = {},
  goalItems = null,
  curWk = null,
  todayIso = null,
  earliestWk = null,
}) {
  const today = todayIso || localDateIso();
  const current = curWk || wkStartOf(parseLocalDate(today));
  const items = goalItems?.length ? goalItems : programGoalItems();

  let earliest = earliestWk || earliestWeekFromChecks(checksByWeek, current);
  // Custom goals created before first checkin still need a start week.
  items.forEach((it) => {
    if (it.source === "custom" && it.createdAt) {
      const createdWk = wkStartOf(parseLocalDate(String(it.createdAt).slice(0, 10)));
      if (createdWk < earliest) earliest = createdWk;
    }
  });

  const weekStarts = weeksInclusive(earliest, current);
  const elapsed = daysElapsedInWeek(current, today);

  const byGoalId = {};
  items.forEach((it) => {
    byGoalId[it.id] = weekStarts.map((wk, wi) => {
      const isCurrentWeek = wk === current;
      const ch = checksByWeek[wk] || {};
      const stats = goalWeekStats(it, ch, wk, { isCurrentWeek, elapsed });
      return {
        week: wk,
        label: `W${wi + 1}`,
        isCurrentWeek,
        ...stats,
      };
    });
  });

  const allSeries = weekStarts.map((wk, wi) => {
    const isCurrentWeek = wk === current;
    let sum = 0;
    let n = 0;
    items.forEach((it) => {
      const row = byGoalId[it.id][wi];
      if (row.active && row.pct != null) {
        sum += row.pct;
        n += 1;
      }
    });
    return {
      week: wk,
      label: `W${wi + 1}`,
      isCurrentWeek,
      pct: n ? Math.round(sum / n) : null,
      activeCount: n,
    };
  });

  // Steadiest habit = highest avg pct across completed (non-current) weeks where active.
  let steadiest = null;
  let bestAvg = -1;
  items.forEach((it) => {
    const rows = byGoalId[it.id] || [];
    let s = 0;
    let n = 0;
    rows.forEach((r) => {
      if (!r.isCurrentWeek && r.active && r.pct != null) {
        s += r.pct;
        n += 1;
      }
    });
    if (n && s / n > bestAvg) {
      bestAvg = s / n;
      steadiest = it;
    }
  });

  return {
    weeks: weekStarts,
    goals: items,
    allSeries,
    byGoalId,
    steadiest,
    currentWeek: current,
    elapsed,
  };
}

export function bestCompletedWeek(series) {
  let best = null;
  (series || []).forEach((r) => {
    if (r.isCurrentWeek || !r.active || r.pct == null) return;
    if (!best || r.pct > best.pct) best = r;
  });
  return best;
}

/** Short chip label for filter row. */
export function goalChipLabel(item) {
  if (!item) return "";
  if (item.source === "custom") {
    const base = item.label.length > 18 ? `${item.label.slice(0, 16)}…` : item.label;
    return `${base}`;
  }
  const map = {
    macros: "Macros",
    water: "Water",
    steps: "Steps",
    sun: "Sunlight",
    home: "Home meals",
    strength: "Strength",
  };
  return map[item.id] || item.label;
}
