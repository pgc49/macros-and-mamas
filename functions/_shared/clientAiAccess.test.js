import { describe, expect, it } from "vitest";

import { selfFromRows } from "./clientAiAccess.js";

describe("loadSelf keeps the fields the coach already stores", () => {
  it("keeps months postpartum, approved ranges, and Callie's notes", () => {
    const self = selfFromRows(
      {
        name: "QA",
        diet: "none",
        pref_d: "chicken",
        season_note: "nursing",
        allergens: ["dairy"],
        breastfeeding: true,
        months_pp: "4",
      },
      {
        cal: 1800,
        protein: 140,
        carbs: 160,
        fat: 55,
        notes: [" no oats ", "", "keep fat at the low end"],
      },
    );
    expect(self.profile.monthsPP).toBe(4);
    expect(self.profile.breastfeeding).toBe(true);
    expect(self.profile.prefD).toBe("chicken");
    expect(self.macros).toEqual({
      cal: 1800,
      protein: 140,
      carbs: 160,
      fat: 55,
      notes: ["no oats", "keep fat at the low end"],
    });
  });

  it("does not invent a stage or notes when the row has none", () => {
    const self = selfFromRows({ name: "QA", breastfeeding: false }, { cal: 1700, protein: 120, carbs: 150, fat: 50 });
    expect(self.profile.monthsPP).toBeNull();
    expect(self.macros.notes).toEqual([]);
  });
});
