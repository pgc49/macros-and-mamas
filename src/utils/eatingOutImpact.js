/**
 * Day-range impact helpers for restaurant menu picks.
 * remaining = room to day HIGH before this meal.
 */

export function roomLeftFromTotals(dayTotals, bands) {
  const totals = dayTotals || { cal: 0, p: 0, c: 0, f: 0 };
  if (!bands) {
    return { dayTotals: totals, remaining: null, bands: null };
  }
  return {
    dayTotals: totals,
    bands,
    remaining: {
      cal: bands.calHi - (totals.cal || 0),
      p: bands.pHi - (totals.p || 0),
      c: bands.cHi - (totals.c || 0),
      f: bands.fHi - (totals.f || 0),
    },
  };
}

export function eatingOutDayImpact(meal, remaining, dayTotals, bands) {
  if (!meal || !bands || !remaining) return null;
  const m = {
    cal: Number(meal.cal) || 0,
    p: Number(meal.p) || 0,
    c: Number(meal.c) || 0,
    f: Number(meal.f) || 0,
  };
  const left = {
    cal: remaining.cal - m.cal,
    p: remaining.p - m.p,
    c: remaining.c - m.c,
    f: remaining.f - m.f,
  };
  const projected = {
    cal: (dayTotals?.cal || 0) + m.cal,
    p: (dayTotals?.p || 0) + m.p,
    c: (dayTotals?.c || 0) + m.c,
    f: (dayTotals?.f || 0) + m.f,
  };
  const overs = [];
  if (left.cal < -40) overs.push(`~${Math.round(-left.cal)} cal`);
  if (left.p < -8) overs.push(`~${Math.round(-left.p)}g P`);
  if (left.c < -15) overs.push(`~${Math.round(-left.c)}g C`);
  if (left.f < -8) overs.push(`~${Math.round(-left.f)}g F`);
  const fits = overs.length === 0;
  const pGapBefore = bands.pLo - (dayTotals?.p || 0);
  const helpsProtein = pGapBefore > 8 && m.p >= 25 && left.p >= -8;
  let badge;
  if (!fits) badge = `Over day high · ${overs[0]}`;
  else if (helpsProtein) badge = "Fits · helps protein toward range";
  else if (remaining.cal > 250 && m.cal <= remaining.cal * 0.4) badge = "Fits · lighter on today's room";
  else badge = "Fits today's room";
  const detail = fits
    ? `Leaves ~${Math.max(0, Math.round(left.cal))} cal · P ${Math.round(left.p)}g · C ${Math.round(left.c)}g · F ${Math.round(left.f)}g to your day high`
    : `Day would hit ~${Math.round(projected.cal)} cal · P ${Math.round(projected.p)}g · C ${Math.round(projected.c)}g · F ${Math.round(projected.f)}g`;
  const overPenalty =
    Math.max(0, -left.cal) * 1.2
    + Math.max(0, -left.p) * 4
    + Math.max(0, -left.c) * 2
    + Math.max(0, -left.f) * 3;
  const proteinBonus = helpsProtein ? Math.min(m.p, Math.max(0, pGapBefore)) * 2 : 0;
  return { badge, detail, fits, score: overPenalty - proteinBonus, helpsProtein };
}

const FALLBACK_RANK_LABELS = [
  "Best fit",
  "Strong alternative",
  "Protein-forward",
  "Lighter pick",
  "If you're hungry",
];

/**
 * Sort by day-range fit and attach rank (1–5) + rankLabel for scanning.
 * Prefers model rankLabel when present and unique; otherwise fallback labels.
 */
export function rankEatingOutPicks(meals, remaining, dayTotals, bands) {
  const list = Array.isArray(meals) ? [...meals] : [];
  list.sort((a, b) => {
    const ia = eatingOutDayImpact(a, remaining, dayTotals, bands);
    const ib = eatingOutDayImpact(b, remaining, dayTotals, bands);
    return (ia?.score ?? 0) - (ib?.score ?? 0);
  });
  const used = new Set();
  const takeLabel = (candidate) => {
    const label = String(candidate || "").trim();
    if (!label || used.has(label.toLowerCase())) return null;
    used.add(label.toLowerCase());
    return label;
  };
  return list.slice(0, 5).map((meal, i) => {
    const impact = eatingOutDayImpact(meal, remaining, dayTotals, bands);
    let label = takeLabel(meal.rankLabel);
    if (!label && i === 2 && impact?.helpsProtein) label = takeLabel("Protein-forward");
    if (!label && i === 3 && impact?.fits) label = takeLabel("Lighter pick");
    if (!label) label = takeLabel(FALLBACK_RANK_LABELS[i]);
    if (!label) {
      for (const fallback of FALLBACK_RANK_LABELS) {
        label = takeLabel(fallback);
        if (label) break;
      }
    }
    if (!label) {
      label = `Pick ${i + 1}`;
      used.add(label.toLowerCase());
    }
    return { ...meal, rank: i + 1, rankLabel: label };
  });
}
