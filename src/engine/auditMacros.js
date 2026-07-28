/* ------------------------------------------------------------------ */
/*  Macro audit — read-only check of stored macros against Callie's    */
/*  hand rules. Never writes. Suggestions are shown, never applied.    */
/*                                                                     */
/*  Callie's rules (her words):                                        */
/*    Calories      = goal weight x 12                                 */
/*    Breastfeeding = goal weight x 13, minimum 1800                   */
/*    Protein       = 1g per pound of goal weight                      */
/*    Fat           = 0.3–0.5g per pound of goal weight                */
/*    Carbs         = fill in the rest                                 */
/* ------------------------------------------------------------------ */

export const MACRO_RULES = {
  calPerLb: 12,
  calPerLbBreastfeeding: 13,
  breastfeedingFloor: 1800,
  proteinPerLb: 1,
  fatPerLbMin: 0.3,
  fatPerLbMax: 0.5,
  fatPerLbTarget: 0.4,
};

/** Slack before a number counts as "off" — absorbs 5g/10kcal rounding. */
export const MACRO_TOLERANCE = {
  cal: 25,
  protein: 5,
  sum: 25,
};

const round5 = (n) => Math.round(n / 5) * 5;
const num = (v) => (v === "" || v == null ? null : Number(v));

/** Calories + protein + fat band + remainder carbs for one goal weight. */
export function targetMacros({ goalWeight, breastfeeding }) {
  const gw = Number(goalWeight);
  if (!Number.isFinite(gw) || gw <= 0) return null;

  const mult = breastfeeding ? MACRO_RULES.calPerLbBreastfeeding : MACRO_RULES.calPerLb;
  const raw = Math.round(gw * mult);
  const floor = breastfeeding ? MACRO_RULES.breastfeedingFloor : 0;
  const cal = Math.max(raw, floor);

  const protein = round5(gw * MACRO_RULES.proteinPerLb);
  const fat = round5(gw * MACRO_RULES.fatPerLbTarget);
  const fatMin = Math.round(gw * MACRO_RULES.fatPerLbMin);
  const fatMax = Math.round(gw * MACRO_RULES.fatPerLbMax);
  const carbs = round5((cal - protein * 4 - fat * 9) / 4);

  return {
    cal,
    rawCal: raw,
    mult,
    floorApplied: cal > raw,
    protein,
    fat,
    fatMin,
    fatMax,
    carbs,
  };
}

/** Calories the four stored numbers actually add up to. */
export function caloriesFromMacros({ protein, fat, carbs }) {
  return Math.round((Number(protein) || 0) * 4 + (Number(carbs) || 0) * 4 + (Number(fat) || 0) * 9);
}

/**
 * Notes are written once at intake and never re-run, so a later hand-edit can
 * leave a mama reading a promise her numbers no longer keep.
 */
const NOTE_CLAIMS = [
  { re: /carbs capped at (\d+)\s*g/i, field: "carbs", unit: "g carbs" },
  { re: /Raised to the (\d+) calorie floor/i, field: "cal", unit: " calories" },
];

function auditNotes(notes, current) {
  const stale = [];
  for (const note of Array.isArray(notes) ? notes : []) {
    for (const claim of NOTE_CLAIMS) {
      const hit = claim.re.exec(String(note || ""));
      if (!hit) continue;
      const promised = Number(hit[1]);
      const actual = current[claim.field];
      if (Number.isFinite(promised) && actual !== promised) {
        stale.push({
          code: "stale_note",
          label: "Her dashboard note contradicts her numbers",
          detail: `Note says "${note}" but ${claim.field === "cal" ? "calories read" : "carbs read"} ${actual}${claim.field === "cal" ? "" : "g"}.`,
          current: actual,
          expected: promised,
          delta: actual - promised,
        });
      }
    }
  }
  return stale;
}

/**
 * Audit one client row (shape from db.loadRoster()).
 * Returns null when there is nothing to check (no intake / no macros).
 */
export function auditClientMacros(client) {
  if (!client?.macros) return null;

  const gw = num(client.goalWeight);
  const bf = !!client.breastfeeding;
  const m = client.macros;
  const current = {
    cal: Number(m.cal) || 0,
    protein: Number(m.protein) || 0,
    fat: Number(m.fat) || 0,
    carbs: Number(m.carbs) || 0,
  };
  const noteIssues = auditNotes(m.notes, current);

  const base = {
    id: client.id,
    name: client.name || client.email || "Mama",
    email: client.email || "",
    goalWeight: gw,
    currentWeight: num(client.currentWeight),
    breastfeeding: bf,
    goal: client.goal || "lose",
    insulinResistance: !!client.insulinResistance,
    current,
  };

  if (gw == null || !Number.isFinite(gw) || gw <= 0) {
    return {
      ...base,
      target: null,
      suggestion: null,
      issues: [{
        code: "no_goal_weight",
        label: "No goal weight on file",
        detail: "Every number keys off goal weight, so nothing can be checked until it's set.",
      }, ...noteIssues],
    };
  }

  const target = targetMacros({ goalWeight: gw, breastfeeding: bf });
  const issues = [...noteIssues];

  // Callie only gave a rule for cutting. Maintain/gain get surfaced, not scored.
  const goalCovered = !client.goal || client.goal === "lose";

  const calDelta = current.cal - target.cal;
  if (goalCovered && Math.abs(calDelta) > MACRO_TOLERANCE.cal) {
    issues.push({
      code: "cal",
      label: "Calories off",
      detail: target.floorApplied
        ? `Breastfeeding floor is ${MACRO_RULES.breastfeedingFloor} (${gw} x ${target.mult} = ${target.rawCal}).`
        : `${gw} x ${target.mult} = ${target.cal}.`,
      current: current.cal,
      expected: target.cal,
      delta: calDelta,
    });
  }
  if (!goalCovered) {
    issues.push({
      code: "goal_not_covered",
      label: `Goal is "${client.goal}" — no rule written for it`,
      detail: `Your rules cover cutting (x12) and breastfeeding (x13). This row uses ${current.cal} cal; x12 would be ${Math.round(gw * 12)}.`,
      current: current.cal,
      expected: null,
    });
  }

  const proteinDelta = current.protein - target.protein;
  if (Math.abs(proteinDelta) > MACRO_TOLERANCE.protein) {
    issues.push({
      code: "protein",
      label: "Protein off",
      detail: `1g per pound of goal weight = ${target.protein}g.`,
      current: current.protein,
      expected: target.protein,
      delta: proteinDelta,
    });
  }

  if (current.fat < target.fatMin || current.fat > target.fatMax) {
    issues.push({
      code: "fat",
      label: current.fat < target.fatMin ? "Fat below the band" : "Fat above the band",
      detail: `0.3–0.5g per pound of goal weight = ${target.fatMin}–${target.fatMax}g (${(current.fat / gw).toFixed(2)}g/lb today).`,
      current: current.fat,
      expected: target.fat,
      delta: current.fat - (current.fat < target.fatMin ? target.fatMin : target.fatMax),
    });
  }

  const sum = caloriesFromMacros(current);
  const sumDelta = sum - current.cal;
  if (Math.abs(sumDelta) > MACRO_TOLERANCE.sum) {
    issues.push({
      code: "sum",
      label: "Numbers don't add up",
      detail: `${current.protein}p + ${current.carbs}c + ${current.fat}f = ${sum} cal, but her calorie target reads ${current.cal}.`,
      current: sum,
      expected: current.cal,
      delta: sumDelta,
    });
  }

  const suggestion = goalCovered
    ? { cal: target.cal, protein: target.protein, fat: target.fat, carbs: target.carbs }
    : null;

  return { ...base, target, issues, suggestion, severity: severityOf(issues) };
}

/** How loudly to shout. Anything at "high" moves a mama's day materially. */
export const SEVERITY_RANK = { high: 3, medium: 2, low: 1 };

function severityOf(issues) {
  let worst = "low";
  for (const i of issues) {
    const d = Math.abs(i.delta || 0);
    let s = "low";
    if (i.code === "cal" || i.code === "sum") s = d >= 150 ? "high" : d >= 50 ? "medium" : "low";
    else if (i.code === "protein") s = d >= 20 ? "high" : d >= 10 ? "medium" : "low";
    else if (i.code === "fat") s = d >= 10 ? "medium" : "low";
    else if (i.code === "stale_note") s = "medium";
    else if (i.code === "no_goal_weight") s = "high";
    if (SEVERITY_RANK[s] > SEVERITY_RANK[worst]) worst = s;
  }
  return worst;
}

/** Audit a whole roster. Skips unpaid/refunded/no-intake rows. */
export function auditRoster(clients, { includeAdmins = false } = {}) {
  return (clients || [])
    .filter((c) => c && c.macros && !c.refunded)
    .filter((c) => includeAdmins || String(c.role || "").toLowerCase() !== "admin")
    .map(auditClientMacros)
    .filter((a) => a && a.issues.length > 0)
    .sort((a, b) => (SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])
      || (b.issues.length - a.issues.length)
      || String(a.name).localeCompare(String(b.name)));
}
