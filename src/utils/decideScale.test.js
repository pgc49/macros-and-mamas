import { describe, expect, it } from "vitest";
import { DECIDE_COPY, knowLaterCopy } from "../content/decideVoice.js";
import {
  decideDisplayMacros,
  decideLogFromCard,
  decidePlanFieldsFromCard,
} from "./decideScale.js";

describe("decideLogFromCard", () => {
  it("does not double-scale a card that already has servings=2 macros", () => {
    const card = {
      name: "Halibut + rice",
      cal: 1610,
      p: 140,
      c: 148,
      f: 50,
      servings: 2,
    };
    const logged = decideLogFromCard(card);
    expect(logged.cal).toBe(1610);
    expect(logged.p).toBe(140);
    expect(logged.c).toBe(148);
    expect(logged.f).toBe(50);
    expect(logged.name).toBe("Halibut + rice · 2×");
    expect(logged.name.match(/×/g)?.length).toBe(1);
    expect(decideLogFromCard(card, 2).cal).toBe(1610);
  });
});

describe("pencil → Ate it keeps the sheet portion", () => {
  it("logs ~1.5× bank macros for a 1.5× ranked card", () => {
    const card = {
      name: "Salmon salad bowl",
      cal: 503,
      p: 59,
      c: 9,
      f: 23,
      servings: 1.5,
    };
    const fields = decidePlanFieldsFromCard(card);
    expect(fields.qty).toBe(1.5);
    expect(fields.servings).toBe(1.5);
    expect(fields.cal).toBeCloseTo(335.333, 0);
    expect(fields.p).toBeCloseTo(39.333, 0);
    const shown = decideDisplayMacros(fields);
    expect(shown.cal).toBeCloseTo(503, 0);
    expect(shown.p).toBeCloseTo(59, 0);
  });
});

describe("knowLaterCopy", () => {
  it("is slot-aware and keeps the dinner string for dinner", () => {
    expect(knowLaterCopy("lunch")).toBe("Know what lunch is yet?");
    expect(knowLaterCopy("snack")).toBe("Know what snack is yet?");
    expect(knowLaterCopy("dinner")).toBe(DECIDE_COPY.knowDinner);
  });
});
