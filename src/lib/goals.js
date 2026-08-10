/**
 * Habit goals helpers — program (DEFAULT_ITEMS) + mama custom goals.
 * Completions stay in checkins; custom rows use UUID item_id.
 */
import { DEFAULT_ITEMS, DAYS } from "../content/data";
import {
  addDaysIso,
  localDateIso,
  parseLocalDate,
  weekdayKey,
  wkStartOf,
} from "../utils/dates";

export const CUSTOM_GOAL_CAP = 3;
export const CUSTOM_TITLE_MAX = 30;
export const CUSTOM_SUBTITLE_MAX = 20;

/** Program goals — same ids as historical checkins (macros, water, …). */
export function programGoalItems() {
  return DEFAULT_ITEMS.map((it, i) => ({
    id: it.id,
    label: it.label,
    subtitle: null,
    source: "program",
    daily: !!it.daily,
    nTarget: it.daily ? null : 3,
    frequency: it.daily ? "daily" : "n_per_week",
    sort: i,
    createdAt: null,
  }));
}

/**
 * Local calendar YYYY-MM-DD for a goal's created_at.
 * Must NOT use String(ts).slice(0, 10) — Date objects become "Mon Aug 10",
 * and UTC date prefixes can fall on the next calendar day vs the mama's local week
 * (Sunday evening US → Monday UTC), which made mid-week targets show "0".
 */
export function goalCreatedDateIso(createdAt) {
  if (!createdAt) return null;
  if (createdAt instanceof Date) {
    return Number.isNaN(createdAt.getTime()) ? null : localDateIso(createdAt);
  }
  if (typeof createdAt === "string") {
    const trimmed = createdAt.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    // Postgres often returns "YYYY-MM-DD HH:MM:SS+00" — normalize for Date.parse.
    let normalized = /^\d{4}-\d{2}-\d{2} /.test(trimmed)
      ? trimmed.replace(" ", "T")
      : trimmed;
    // "+00" / "-07" → "+00:00" / "-07:00"
    normalized = normalized.replace(/([+-]\d{2})$/, "$1:00");
    const d = new Date(normalized);
    if (!Number.isNaN(d.getTime())) return localDateIso(d);
    const m = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
  }
  const d = new Date(createdAt);
  return Number.isNaN(d.getTime()) ? null : localDateIso(d);
}

/** Map a custom_goals DB row → UI item. */
export function customRowToItem(row) {
  const daily = row.frequency === "daily";
  return {
    id: row.id,
    label: String(row.title || "").trim(),
    subtitle: row.subtitle ? String(row.subtitle).trim() : null,
    source: "custom",
    daily,
    nTarget: daily ? null : Number(row.n_target) || 3,
    frequency: daily ? "daily" : "n_per_week",
    sort: Number(row.sort) || 100,
    createdAt: row.created_at || null,
  };
}

export function mergeGoalItems(customRows = []) {
  const program = programGoalItems();
  const custom = (customRows || [])
    .filter((r) => !r.archived_at)
    .map(customRowToItem)
    .sort((a, b) => a.sort - b.sort || String(a.createdAt).localeCompare(String(b.createdAt)));
  return [...program, ...custom];
}

export function dayIndex(dayKey) {
  return DAYS.indexOf(dayKey);
}

/** First day index (0–6) this custom goal counts in a week; 0 if whole week. */
export function goalEligibleFromDayIndex(item, weekStart) {
  if (!item || item.source !== "custom") return 0;
  const createdDate = goalCreatedDateIso(item.createdAt);
  if (!createdDate) return 0;
  const wk = weekStart || wkStartOf();
  const weekEnd = addDaysIso(wk, 6);
  if (createdDate < wk) return 0;
  if (createdDate > weekEnd) return 7; // not in this week
  const idx = dayIndex(weekdayKey(createdDate));
  return idx < 0 ? 0 : idx;
}

/** Target checks for one goal in a given week (Stage 5 mid-week custom daily rule). */
export function goalWeekTarget(item, weekStart) {
  if (!item.daily) return Math.max(1, Number(item.nTarget) || 3);

  if (item.source !== "custom" || !item.createdAt) return 7;

  const createdDate = goalCreatedDateIso(item.createdAt);
  if (!createdDate) return 7;

  const wk = weekStart || wkStartOf();
  const weekEnd = addDaysIso(wk, 6);

  // Created before this week → full week.
  if (createdDate < wk) return 7;
  // Created after this week → shouldn't appear; treat as 0.
  if (createdDate > weekEnd) return 0;

  const createdIdx = dayIndex(weekdayKey(createdDate));
  if (createdIdx < 0) return 7;

  // Remaining days including create day → through Sunday.
  return 7 - createdIdx;
}

export function goalChecksThisWeek(checks, itemId, fromDayIndex = 0) {
  const ch = checks || {};
  const start = Math.max(0, Number(fromDayIndex) || 0);
  return DAYS.filter((d, i) => i >= start && ch[`${itemId}|${d}`]).length;
}

/** True when this day is before a custom goal existed (not tappable / not countable). */
export function isBeforeGoalCreated(item, weekStart, dayKey) {
  if (!item || item.source !== "custom") return false;
  const createdDate = goalCreatedDateIso(item.createdAt);
  if (!createdDate) return false;
  const wk = weekStart || wkStartOf();
  const weekEnd = addDaysIso(wk, 6);
  // Whole week is before the goal existed.
  if (createdDate > weekEnd) return true;
  // Created before this week → every day is eligible.
  if (createdDate < wk) return false;
  const createdIdx = dayIndex(weekdayKey(createdDate));
  if (createdIdx < 0) return false;
  return dayIndex(dayKey) < createdIdx;
}

/**
 * Week % = average of per-goal completion ratios (Stage 5 / mockup).
 * Program goals keep full weekly targets; mid-week custom dailies use remaining days.
 */
export function adherenceForItems(checksByWeek, wk, items) {
  const list = items?.length ? items : programGoalItems();
  const ch = (checksByWeek || {})[wk] || {};
  if (!list.length) return 0;

  let sum = 0;
  let n = 0;
  list.forEach((it) => {
    const target = goalWeekTarget(it, wk);
    if (target <= 0) return;
    const from = it.daily ? goalEligibleFromDayIndex(it, wk) : 0;
    const hits = goalChecksThisWeek(ch, it.id, from >= 7 ? 7 : from);
    sum += Math.min(hits / target, 1);
    n += 1;
  });
  return n ? Math.round((sum / n) * 100) : 0;
}

export function isFutureDayInWeek(weekStart, dayKey, todayIso) {
  const todayWk = wkStartOf(parseLocalDate(todayIso));
  if (weekStart < todayWk) return false;
  if (weekStart > todayWk) return true;
  return dayIndex(dayKey) > dayIndex(weekdayKey(todayIso));
}

export function frequencyFromForm(freqKey) {
  if (freqKey === "3") return { frequency: "n_per_week", n_target: 3 };
  if (freqKey === "5") return { frequency: "n_per_week", n_target: 5 };
  return { frequency: "daily", n_target: null };
}

export function formFreqFromItem(item) {
  if (!item || item.daily) return "daily";
  if (Number(item.nTarget) === 5) return "5";
  return "3";
}
