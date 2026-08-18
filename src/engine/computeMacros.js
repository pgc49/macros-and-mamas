/**
 * Intake / admin draft macros — same bands as the ranges quiz.
 * Stores the low end of each band; the dashboard draws +10g / +150 cal.
 * Does not rewrite already-approved macros.
 */
import { computeRangeBands } from "./rangesEngine.mjs";

export function computeMacros(p) {
  const nursing = !!p.breastfeeding;
  const bands = computeRangeBands({
    goalWeightLbs: p.goalWeight,
    nursing,
    bumpCarbsTo100: true,
  });

  if (!bands.ok) {
    return {
      cal: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
      notes: ["Need a goal weight to draft ranges."],
    };
  }

  const notes = [];
  if (nursing) {
    notes.push("Breastfeeding: calories set gentler (×13 instead of ×12) to protect supply.");
  }
  if (bands.floorApplied) {
    notes.push("Raised to the 1500 calorie floor — going lower risks muscle loss.");
  }
  if (bands.carbsBumped) {
    notes.push("Carbs raised to 100g minimum.");
  }
  if (p.goal === "maintain") {
    notes.push("Maintain goal — starting from cut-style bands. Edit before approving.");
  } else if (p.goal === "gain") {
    notes.push("Gain goal — starting from cut-style bands. Edit before approving.");
  }
  if (p.insulinResistance) {
    notes.push("Insulin resistance flagged — formula does not cap carbs. Edit the band if you want it lower.");
  }

  return {
    cal: bands.calories_low,
    protein: bands.protein_low_g,
    fat: bands.fat_low_g,
    carbs: bands.carbs_low_g,
    notes,
  };
}
