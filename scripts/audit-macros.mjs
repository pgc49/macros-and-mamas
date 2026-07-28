/**
 * Read-only macro audit. Prints every mama whose stored macros drift from
 * Callie's rules. Changes nothing — the suggestion column is a proposal.
 *
 * Feed it rows from Supabase (profiles joined to macros):
 *
 *   select p.id, p.name, p.last_name, p.email, p.role, p.status, p.paid,
 *          p.refunded, p.current_weight, p.goal_weight, p.months_pp,
 *          p.breastfeeding, p.goal, p.insulin_resistance,
 *          m.cal, m.protein, m.fat, m.carbs, m.approved, m.notes
 *   from profiles p left join macros m on m.profile_id = p.id;
 *
 *   npx vite-node scripts/audit-macros.mjs < rows.json
 *   npx vite-node scripts/audit-macros.mjs rows.json --admins
 */
import { readFileSync } from "node:fs";
import { auditRoster, caloriesFromMacros } from "../src/engine/auditMacros.js";

const args = process.argv.slice(2);
const includeAdmins = args.includes("--admins");
const file = args.find((a) => !a.startsWith("--"));
const raw = readFileSync(file || 0, "utf8");
const rows = JSON.parse(raw);

/** Supabase row → the roster shape auditRoster() expects. */
function toClient(r) {
  const hasMacros = r.cal != null || r.protein != null || r.fat != null || r.carbs != null;
  return {
    id: r.id,
    name: [r.name, r.last_name].filter(Boolean).join(" ").trim() || r.email,
    email: r.email,
    role: r.role,
    status: r.status,
    paid: !!r.paid,
    refunded: !!r.refunded,
    currentWeight: r.current_weight,
    goalWeight: r.goal_weight,
    monthsPP: r.months_pp,
    breastfeeding: !!r.breastfeeding,
    goal: r.goal,
    insulinResistance: !!r.insulin_resistance,
    macros: hasMacros
      ? {
          cal: r.cal,
          protein: r.protein,
          fat: r.fat,
          carbs: r.carbs,
          approved: !!r.approved,
          notes: Array.isArray(r.notes) ? r.notes : [],
        }
      : null,
  };
}

const clients = rows.map(toClient);
const withMacros = clients.filter((c) => c.macros && !c.refunded
  && (includeAdmins || String(c.role || "").toLowerCase() !== "admin"));
const flagged = auditRoster(clients, { includeAdmins });

const sign = (n) => (n > 0 ? `+${n}` : String(n));

console.log(`Checked ${withMacros.length} mamas with macros on file.`);
console.log(`${flagged.length} flagged · ${withMacros.length - flagged.length} match the rules.`);

const byCode = {};
for (const a of flagged) for (const i of a.issues) byCode[i.code] = (byCode[i.code] || 0) + 1;
console.log(`By issue: ${Object.entries(byCode).map(([k, n]) => `${k}=${n}`).join(" · ")}\n`);

for (const level of ["high", "medium", "low"]) {
  const group = flagged.filter((a) => a.severity === level);
  if (!group.length) continue;
  console.log(`${"=".repeat(60)}\n${level.toUpperCase()} — ${group.length}\n${"=".repeat(60)}`);
  for (const a of group) {
    const bf = a.breastfeeding ? " · breastfeeding" : "";
    console.log(`${a.name}  (goal ${a.goalWeight ?? "?"} lb${bf})`);
    console.log(`  now:  ${a.current.cal} cal · ${a.current.protein}p / ${a.current.carbs}c / ${a.current.fat}f`
      + `  (adds to ${caloriesFromMacros(a.current)} cal)`);
    if (a.suggestion) {
      const s = a.suggestion;
      console.log(`  rule: ${s.cal} cal · ${s.protein}p / ${s.carbs}c / ${s.fat}f`);
    }
    for (const i of a.issues) {
      const delta = i.delta != null ? ` [${sign(i.delta)}]` : "";
      console.log(`  - ${i.label}${delta}: ${i.detail}`);
    }
    console.log("");
  }
}
