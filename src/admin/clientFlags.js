/**
 * Deterministic flag chips for the admin client card. Reuses habit rhythm,
 * range math, and roster activity — no model.
 */
import { buildHabitRhythm, goalChipLabel } from "../lib/habitRhythm";
import { formatRangeProgress, rangeState } from "../utils/rangeProgress";
import { localDateIso } from "../utils/dates";

export function daysSinceIso(iso, todayIso = localDateIso()) {
  if (!iso) return null;
  const day = String(iso).slice(0, 10);
  if (!day) return null;
  const a = Date.parse(`${day}T00:00:00`);
  const b = Date.parse(`${todayIso}T00:00:00`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

export function buildClientFlagChips({
  client,
  checksByWeek = {},
  goalItems = [],
  macroHistory = [],
  programStartWeek = null,
  todayIso = localDateIso(),
} = {}) {
  const chips = [];
  if (!client) return chips;

  if (client.pregnant) chips.push({ id: "pregnant", label: "Pregnant — review 1:1" });
  const mo = client.monthsPP != null && client.monthsPP !== "" ? Number(client.monthsPP) : null;
  if (client.breastfeeding && mo != null && !Number.isNaN(mo) && mo < 3) {
    chips.push({ id: "early_pp", label: "Early PP / nursing" });
  }

  const lastActive = client.lastActiveDate || client.lastMealDate;
  const quietDays = daysSinceIso(lastActive, todayIso);
  if (lastActive && quietDays != null && quietDays >= 2) {
    chips.push({ id: "quiet", label: `Hasn’t logged ${quietDays}d` });
  } else if (!lastActive && (client.stage === "active" || client.status === "active")) {
    chips.push({ id: "quiet", label: "Hasn’t logged yet" });
  }

  const lastAdmin = client.lastAdminAt;
  const dmDays = daysSinceIso(lastAdmin, todayIso);
  if (Number(client.unreadFromMama) > 0) {
    chips.push({ id: "replied", label: "She wrote you" });
  } else if (dmDays != null && dmDays >= 7) {
    chips.push({ id: "no_dm", label: `No DM in ${dmDays}d` });
  }

  const macros = client.macros;
  if (macros && Array.isArray(macroHistory) && macroHistory.length >= 3) {
    const recent = macroHistory.slice(-5);
    const under = recent.filter((d) => {
      const cal = Number(d.cal);
      const lo = Number(macros.cal);
      return Number.isFinite(cal) && Number.isFinite(lo) && rangeState(cal, lo, lo + 150) === "under";
    }).length;
    if (under >= 3) {
      const last = recent[recent.length - 1];
      const progress = formatRangeProgress(last.cal, macros.cal, macros.cal + 150, "cal");
      chips.push({
        id: "macros_under",
        label: progress?.detail ? `Macros under · ${progress.detail}` : "Macros trending under",
      });
    }
  }

  const rhythm = buildHabitRhythm({
    checksByWeek,
    goalItems,
    programStartWeek,
    todayIso,
  });
  if (losingTooFast(client.weighins)) {
    chips.push({ id: "fast", label: "Losing faster than 1.5 lb/wk" });
  }

  if (rhythm.steadiest) {
    chips.push({
      id: "steadiest",
      label: `Steadiest: ${goalChipLabel(rhythm.steadiest)}`,
    });
  }

  return chips;
}

export function losingTooFast(weighins) {
  if (!Array.isArray(weighins) || weighins.length < 2) return false;
  const sorted = weighins.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const days = daysSinceIso(first.date, last.date);
  if (!days || days < 4) return false;
  const delta = Number(first.w ?? first.weight) - Number(last.w ?? last.weight);
  if (!Number.isFinite(delta) || delta <= 0) return false;
  return (delta / days) * 7 > 1.5;
}
