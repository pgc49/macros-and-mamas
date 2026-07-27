/**
 * Smoke checks for the read-only macro audit.
 * Run: node scripts/smoke-macro-audit.mjs
 */
import {
  targetMacros,
  caloriesFromMacros,
  auditClientMacros,
  auditRoster,
  MACRO_TOLERANCE,
} from "../src/engine/auditMacros.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/* ---- targets follow Callie's rules ---- */
const cut = targetMacros({ goalWeight: 130, breastfeeding: false });
assert(cut.cal === 1560, `130 x 12 = 1560, got ${cut.cal}`);
assert(cut.protein === 130, `1g/lb = 130, got ${cut.protein}`);
assert(cut.fatMin === 39 && cut.fatMax === 65, `fat band 39–65, got ${cut.fatMin}–${cut.fatMax}`);
// Rounding every gram to the nearest 5 can leave a few calories on the table.
assert(
  Math.abs(caloriesFromMacros(cut) - cut.cal) <= MACRO_TOLERANCE.sum,
  `carbs should fill the rest: ${caloriesFromMacros(cut)} vs ${cut.cal}`,
);

const nursing = targetMacros({ goalWeight: 185, breastfeeding: true });
assert(nursing.cal === 2405, `185 x 13 = 2405, got ${nursing.cal}`);
assert(!nursing.floorApplied, "185 x 13 clears the 1800 floor");

const smallNursing = targetMacros({ goalWeight: 125, breastfeeding: true });
assert(smallNursing.cal === 1800, `125 x 13 = 1625 → floor 1800, got ${smallNursing.cal}`);
assert(smallNursing.floorApplied, "floor should be flagged as applied");

/* ---- a client exactly on the rules is not flagged ---- */
const onRule = {
  id: "ok",
  name: "On Rule",
  goalWeight: 130,
  breastfeeding: false,
  goal: "lose",
  macros: { cal: cut.cal, protein: cut.protein, fat: cut.fat, carbs: cut.carbs, notes: [] },
};
assert(auditClientMacros(onRule).issues.length === 0, "on-rule client should be clean");
assert(auditRoster([onRule]).length === 0, "clean roster returns nothing");

/* ---- each rule break is caught ---- */
const codes = (c) => auditClientMacros(c).issues.map((i) => i.code);

assert(
  codes({ ...onRule, macros: { ...onRule.macros, cal: 1900, carbs: cut.carbs + 85 } }).includes("cal"),
  "calorie drift should flag",
);
assert(
  codes({ ...onRule, macros: { ...onRule.macros, protein: 110 } }).includes("protein"),
  "protein under 1g/lb should flag",
);
assert(
  codes({ ...onRule, macros: { ...onRule.macros, fat: 20 } }).includes("fat"),
  "fat under 0.3g/lb should flag",
);
assert(
  !codes({ ...onRule, macros: { ...onRule.macros, fat: 60, carbs: cut.carbs - 22 } }).includes("fat"),
  "fat inside 0.3–0.5g/lb should not flag",
);
assert(
  codes({ ...onRule, macros: { ...onRule.macros, carbs: cut.carbs + 40 } }).includes("sum"),
  "carbs that overshoot the calorie total should flag",
);
assert(
  codes({ ...onRule, goal: "gain" }).includes("goal_not_covered"),
  "gain has no written rule and should surface",
);
assert(
  codes({
    ...onRule,
    macros: { ...onRule.macros, notes: ["Insulin resistance flagged: carbs capped at 100g (Callie's fat-loss shortcut)."] },
  }).includes("stale_note"),
  "a note promising 100g carbs against 150g carbs should flag",
);
assert(
  codes({ ...onRule, goalWeight: null }).includes("no_goal_weight"),
  "missing goal weight should flag",
);

/* ---- the audit never mutates its input ---- */
const before = JSON.stringify(onRule);
auditClientMacros(onRule);
assert(JSON.stringify(onRule) === before, "audit must not mutate the client row");

/* ---- roster filtering ---- */
const broken = { ...onRule, id: "x", macros: { ...onRule.macros, protein: 90 } };
assert(auditRoster([{ ...broken, refunded: true }]).length === 0, "refunded rows are skipped");
assert(auditRoster([{ ...broken, role: "admin" }]).length === 0, "admins are skipped by default");
assert(auditRoster([{ ...broken, role: "admin" }], { includeAdmins: true }).length === 1, "admins opt-in");
assert(auditRoster([{ ...broken, macros: null }]).length === 0, "no-intake rows are skipped");

console.log("macro audit smoke: all checks passed");
