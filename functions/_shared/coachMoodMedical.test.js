import { describe, expect, it } from "vitest";

import { classifyAsk, isMealAsk } from "./coachGuardrails.js";
import { buildCoachFallbackMeals, stripCoachMealMacros } from "./coachFoodFallback.js";
import { COACH_MOOD_LINE, medicalDeflectLine, moodDeflectLine } from "../../src/content/coachVoice.js";

describe("mood and medical cards", () => {
  it("shows no cards on a mood-only ask", () => {
    const ask = "ive been crying every day this week";
    expect(classifyAsk(ask).scope).toBe("mood");
    expect(isMealAsk(ask)).toBe(false);
    expect(moodDeflectLine(false, { hasFood: isMealAsk(ask) })).toBe(COACH_MOOD_LINE);
  });

  it("shows 2-3 easy plates after a mood ask that also mentions food", () => {
    const ask = "ive been crying every day this week but I still need dinner";
    expect(classifyAsk(ask).scope).toBe("mood");
    expect(isMealAsk(ask)).toBe(true);
    const meals = stripCoachMealMacros(buildCoachFallbackMeals({
      text: ask,
      slot: "dinner",
      count: 3,
      safe: true,
    }));
    expect(meals.length).toBeGreaterThanOrEqual(2);
    expect(meals.length).toBeLessThanOrEqual(3);
    expect(meals.every((meal) => meal.hideMacros && meal.noMealActions)).toBe(true);
    expect(moodDeflectLine(false, { hasFood: true })).toMatch(/here's something easy to eat/);
  });

  it("keeps medical snack cards dairy-free and egg-free", () => {
    const ask = "I've been dizzy since this morning";
    expect(classifyAsk(ask).scope).toBe("urgent");
    const meals = stripCoachMealMacros(buildCoachFallbackMeals({
      text: ask,
      slot: "snack",
      count: 2,
      safe: true,
      profile: { allergies: ["dairy", "eggs"] },
    }));
    expect(meals.length).toBeGreaterThanOrEqual(1);
    expect(meals.length).toBeLessThanOrEqual(2);
    const hay = meals.map((meal) => `${meal.name} ${meal.desc} ${(meal.ingredients || []).map((row) => row.item).join(" ")}`).join(" ").toLowerCase();
    expect(meals.map((meal) => meal.name), hay).not.toEqual([]);
    expect(hay).not.toMatch(/\b(milk|cheese|butter|ricotta|mozzarella|parmesan|eggs?)\b/);
    expect(hay).not.toMatch(/\b(?<!dairy-free )yogurt\b/);
    expect(hay).not.toMatch(/\bcream\b/);
    expect(medicalDeflectLine()).not.toMatch(/chicken|yogurt|rice|toast|eggs?/i);
  });
});
