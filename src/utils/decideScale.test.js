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
  it("stores sheet-scaled macros at qty 1 so grey needs no remultiply", () => {
    const card = {
      name: "Salmon salad bowl",
      cal: 503,
      p: 59,
      c: 9,
      f: 23,
      servings: 1.5,
    };
    const fields = decidePlanFieldsFromCard(card);
    expect(fields.qty).toBe(1);
    expect(fields.servings).toBe(1);
    expect(fields.cal).toBe(503);
    expect(fields.p).toBe(59);
    const shown = decideDisplayMacros({ ...fields, via: "decide" });
    expect(shown.cal).toBe(503);
    expect(shown.p).toBe(59);
  });

  it("decide grey ignores recipe serves / leftover servings", () => {
    const shown = decideDisplayMacros({
      via: "decide",
      cal: 368,
      p: 47,
      c: 42,
      f: 3,
      qty: 1,
      servings: 4,
    });
    expect(shown.cal).toBe(368);
    expect(shown.p).toBe(47);
    expect(shown.qty).toBe(1);
  });
});

describe("knowLaterCopy", () => {
  it("is slot-aware and keeps the dinner string for dinner", () => {
    expect(knowLaterCopy("lunch")).toBe("Know what lunch is yet?");
    expect(knowLaterCopy("snack")).toBe("Know what snack is yet?");
    expect(knowLaterCopy("dinner")).toBe(DECIDE_COPY.knowDinner);
  });
});
