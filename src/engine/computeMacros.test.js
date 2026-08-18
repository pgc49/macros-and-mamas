import { describe, expect, it } from "vitest";
import { computeMacros } from "./computeMacros.js";
import { computeRangeBands, computeRanges } from "./rangesEngine.mjs";

function quizBands({ goalWeight, breastfeeding }) {
  return computeRangeBands({
    goalWeightLbs: goalWeight,
    nursing: !!breastfeeding,
    bumpCarbsTo100: true,
  });
}

describe("computeMacros — same formula as the ranges quiz", () => {
  it("goal 150 nursing matches quiz exclusive bands (lows)", () => {
    const m = computeMacros({ goalWeight: 150, breastfeeding: true, goal: "lose" });
    const q = computeRanges({
      goal_weight_lbs: 150,
      current_weight_lbs: 170,
      height_in: 65,
      feeding: "exclusive",
      goal: "lose_sustainable",
      flags: [],
    });
    expect(q.needs_review).toBe(false);
    expect(m.protein).toBe(150);
    expect(m.fat).toBe(65);
    expect(m.carbs).toBe(170);
    expect(m.cal).toBe(q.calories_low);
    expect(m.cal).toBe(1865);
    expect(m.notes.some((n) => n.includes("×13"))).toBe(true);
  });

  it("goal 140 not nursing matches quiz not_feeding", () => {
    const m = computeMacros({ goalWeight: 140, breastfeeding: false, goal: "lose" });
    const q = quizBands({ goalWeight: 140, breastfeeding: false });
    expect(m.protein).toBe(q.protein_low_g);
    expect(m.fat).toBe(q.fat_low_g);
    expect(m.carbs).toBe(q.carbs_low_g);
    expect(m.cal).toBe(q.calories_low);
    expect(m.protein).toBe(140);
    expect(m.fat).toBe(60);
    expect(m.carbs).toBe(125);
  });

  it("nursing uses ×13 and does not raise to an 1800 floor", () => {
    const m = computeMacros({ goalWeight: 130, breastfeeding: true, goal: "lose" });
    // Old admin floor (1800) produced carbs 175. Quiz ×13 only is 1690 → 145.
    expect(m.carbs).toBe(145);
    expect(m.cal).toBe(1595);
    expect(m.notes.some((n) => n.includes("1800"))).toBe(false);
  });

  it("insulin resistance does not change the quiz bands", () => {
    const plain = computeMacros({ goalWeight: 150, breastfeeding: true, goal: "lose" });
    const flagged = computeMacros({
      goalWeight: 150,
      breastfeeding: true,
      goal: "lose",
      insulinResistance: true,
    });
    expect(flagged.protein).toBe(plain.protein);
    expect(flagged.fat).toBe(plain.fat);
    expect(flagged.carbs).toBe(plain.carbs);
    expect(flagged.cal).toBe(plain.cal);
    expect(flagged.notes.some((n) => n.includes("Insulin resistance"))).toBe(true);
  });

  it("maintain still drafts cut-style bands for Callie to edit", () => {
    const m = computeMacros({ goalWeight: 150, breastfeeding: true, goal: "maintain" });
    expect(m.protein).toBe(150);
    expect(m.cal).toBe(1865);
    expect(m.notes.some((n) => n.includes("Maintain"))).toBe(true);
  });
});
