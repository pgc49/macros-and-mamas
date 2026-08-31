import { describe, expect, it } from "vitest";
import { sanitizeEstimate } from "./estimateShape.js";

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
});
