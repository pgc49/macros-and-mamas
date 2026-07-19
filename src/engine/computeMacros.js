/* ------------------------------------------------------------------ */
/*  Callie's macro engine — PRESERVE VERBATIM                          */
/* ------------------------------------------------------------------ */
const round5 = (n) => Math.round(n / 5) * 5;

export function computeMacros(p) {
  const gw = Number(p.goalWeight);
  let mult = p.goal === "gain" ? 15 : p.goal === "maintain" ? 13.5 : 12;
  let notes = [];

  if (p.breastfeeding && p.goal === "lose") {
    mult = 13;
    notes.push("Breastfeeding: calories set gentler (×13 instead of ×12) to protect supply.");
  }

  let cal = Math.round(gw * mult);

  const floor = p.breastfeeding ? 1800 : 1400;
  if (cal < floor) {
    cal = floor;
    notes.push(`Raised to the ${floor} calorie floor — going lower risks ${p.breastfeeding ? "milk supply and " : ""}muscle loss.`);
  }

  const protein = round5(0.9 * gw);
  const fat = round5(0.4 * gw);
  let carbs = round5((cal - protein * 4 - fat * 9) / 4);

  if (p.insulinResistance && carbs > 100) {
    carbs = 100;
    cal = protein * 4 + fat * 9 + carbs * 4;
    notes.push("Insulin resistance flagged: carbs capped at 100g (Callie's fat-loss shortcut).");
  }
  if (carbs < 100 && p.breastfeeding) {
    carbs = 100;
    cal = protein * 4 + fat * 9 + carbs * 4;
    notes.push("Carbs raised to 100g minimum while breastfeeding.");
  }

  return { cal, protein, fat, carbs, notes };
}
