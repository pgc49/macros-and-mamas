import { describe, expect, it } from "vitest";
import { buildClientSuggestPrompt } from "./clientMealSuggestPrompt.js";

const macros = { cal: 1800, protein: 130, carbs: 160, fat: 55 };
const dolly = {
  name: "Dolly",
  diet: "none",
  prefB: "eggs",
  prefL: "salad",
  prefD: "salmon",
  breastfeeding: false,
  monthsPP: "",
  pregnant: false,
  goal: "lose",
};

describe("buildClientSuggestPrompt", () => {
  it("grounds the week blurb in her season, not a postpartum script", () => {
    const prompt = buildClientSuggestPrompt({ profile: dolly, macros });
    expect(prompt).toMatch(/Name: Dolly/);
    expect(prompt).toMatch(/Postpartum: not listed/);
    expect(prompt).toMatch(/never assume she is postpartum/);
    expect(prompt).not.toMatch(/helping a postpartum client/);
  });
});
