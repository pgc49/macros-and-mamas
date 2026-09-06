import { describe, expect, it } from "vitest";
import { sanitizeEstimate, sanitizeTip } from "./estimateShape.js";

describe("sanitizeEstimate", () => {
  it("refuses explicit parsed.error", () => {
    expect(sanitizeEstimate({ error: "not food" })).toEqual({ error: "not food" });
    expect(sanitizeEstimate({ error: "nope", meal: "Chili", calories: 400 })).toEqual({
      error: "not food",
    });
  });

  it("refuses a meal name that is just error", () => {
    const junk = sanitizeEstimate({
      meal: "error",
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      tip: "I can't open file:///tmp/recipe.txt",
    });
    expect(junk).toEqual({ error: "not food" });
    expect(junk.meal).toBeUndefined();

    expect(sanitizeEstimate({ meal: "ERROR" }, "recipe")).toEqual({ error: "not food" });
    expect(sanitizeEstimate({ meal: " Error " }).error).toBe("not food");
  });

  it("still accepts a real recipe whose name is not error", () => {
    const ok = sanitizeEstimate(
      {
        meal: "Turkey chili",
        servings: 8,
        calories: 3600,
        protein_g: 280,
        carbs_g: 320,
        fat_g: 96,
      },
      "recipe",
    );
    expect(ok.error).toBeUndefined();
    expect(ok.meal).toBe("Turkey chili");
    expect(ok.calories).toBe(3600);
  });

  it("grounds the coaching tip in her profile, not a generic postpartum line", () => {
    const dolly = { name: "Dolly", breastfeeding: false, monthsPP: "", pregnant: false };
    const out = sanitizeEstimate(
      {
        meal: "Salmon and rice",
        calories: 520,
        protein_g: 42,
        carbs_g: 48,
        fat_g: 16,
        tip: "This is an excellent postpartum meal.",
      },
      "meal",
      { profile: dolly },
    );
    expect(out.tip).toBe("This is an excellent meal.");
    expect(out.tip).not.toMatch(/postpartum/i);
  });
});

describe("sanitizeTip", () => {
  it("still strips Callie self-intros", () => {
    expect(sanitizeTip("Callie here — nice protein on this plate.")).toBe("Nice protein on this plate.");
  });
});
