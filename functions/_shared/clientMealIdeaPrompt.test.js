import { describe, expect, it } from "vitest";
import {
  buildDescribeMealPrompt,
  buildEatingOutPrompt,
  buildSlotOptionsPrompt,
} from "./clientMealIdeaPrompt.js";

const macros = { cal: 1800, protein: 130, carbs: 160, fat: 55 };
const dolly = {
  name: "Dolly",
  diet: "none",
  prefB: "eggs",
  prefL: "salad",
  prefD: "salmon",
  prefS: "yogurt",
  breastfeeding: false,
  monthsPP: "",
  pregnant: false,
  goal: "lose",
};

describe("describe / idea prompts ground season in the profile", () => {
  it("does not tell the model Dolly is a postpartum mama", () => {
    const prompt = buildDescribeMealPrompt({
      profile: dolly,
      macros,
      slot: "dinner",
      description: "grilled salmon and rice",
    });
    expect(prompt).toMatch(/Name: Dolly/);
    expect(prompt).toMatch(/Postpartum: not listed/);
    expect(prompt).toMatch(/do NOT assume she is postpartum/);
    expect(prompt).not.toMatch(/postpartum macro coaching/);
    expect(prompt).toMatch(/grilled salmon and rice/);
  });

  it("keeps the same season block on slot options and eating out", () => {
    const options = buildSlotOptionsPrompt({ profile: dolly, macros, slot: "lunch" });
    const eatingOut = buildEatingOutPrompt({ profile: dolly, macros, slot: "dinner" });
    expect(options).toMatch(/Postpartum: not listed/);
    expect(eatingOut).toMatch(/Postpartum: not listed/);
    expect(eatingOut).not.toMatch(/Callie'?s postpartum meal assistant/);
  });
});
