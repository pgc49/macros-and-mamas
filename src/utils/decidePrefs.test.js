import { describe, expect, it } from "vitest";
import {
  dislikeTokens,
  mealAllowedForDiet,
  mealHitsDislike,
  prefsLine,
  tokenizeLikes,
} from "./decidePrefs.js";

const chicken = {
  name: "Grilled chicken big salad",
  ingredients: [{ item: "chicken breast" }, { item: "parmesan" }],
};

describe("diet is a hard filter", () => {
  it("hides land meat from pescatarian / vegetarian / vegan", () => {
    expect(mealAllowedForDiet(chicken, "pescatarian")).toBe(false);
    expect(mealAllowedForDiet(chicken, "vegetarian")).toBe(false);
    expect(mealAllowedForDiet(chicken, "vegan")).toBe(false);
    expect(mealAllowedForDiet({ name: "Salmon salad", ingredients: [{ item: "salmon" }] }, "pescatarian")).toBe(true);
    expect(mealAllowedForDiet({ name: "Salmon salad", ingredients: [{ item: "salmon" }] }, "vegetarian")).toBe(false);
  });
});

describe("likes and dislikes", () => {
  it("tokenizes slot pref text and matches allergens", () => {
    expect(tokenizeLikes("usually chicken and rice bowls")).toContain("chicken");
    const tokens = dislikeTokens({ allergens: ["dairy"], foodAvoids: "cilantro" });
    expect(tokens).toContain("cheese");
    expect(tokens).toContain("cilantro");
    expect(mealHitsDislike(chicken, tokens)).toBe(true);
  });

  it("builds a short prefs line", () => {
    const line = prefsLine({ allergens: ["dairy"], foodAvoids: "cilantro", likes: ["chicken"] });
    expect(line).toMatch(/no dairy/);
    expect(line).toMatch(/likes chicken/);
    expect(line).toMatch(/edit/);
  });
});
