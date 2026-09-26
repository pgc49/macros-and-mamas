/**
 * The prompt is the only thing standing between "what's for breakfast" and a
 * pan-seared salmon dinner. Naming the slot once inside a budget heading was
 * not enough in practice, so the paragraph that says what time of day it is
 * has its own tests.
 */

import { describe, expect, it } from "vitest";

import {
  buildCoachAskPrompt,
  buildCoachKitchenPrompt,
  buildCoachMenuPrompt,
  sanitizeCoachContext,
} from "./coachPrompt.js";

const ARGS = {
  profile: { prefB: "eggs, oats", prefD: "chicken, salmon" },
  budget: { cal: 500, pNeed: 30, c: 50, f: 15 },
  customMeals: [],
  recentNames: ["Greek yogurt + berries"],
};

const builders = [
  ["ask", (a) => buildCoachAskPrompt({ ...a, question: "I don't like any of these" })],
  ["menu", (a) => buildCoachMenuPrompt({ ...a, note: "" })],
  ["kitchen", (a) => buildCoachKitchenPrompt({ ...a, note: "" })],
];

describe("the prompt says what meal she is deciding", () => {
  it.each(builders)("names the time of day in the %s prompt", (_mode, build) => {
    const prompt = build({ ...ARGS, slot: "breakfast" });
    expect(prompt).toContain("What she is deciding");
    expect(prompt).toContain("breakfast, first thing in the morning");
  });

  it.each(builders)("moves the time of day with the slot in the %s prompt", (_mode, build) => {
    expect(build({ ...ARGS, slot: "dinner" })).toContain("dinner, the evening meal");
    expect(build({ ...ARGS, slot: "snack" })).toContain("a snack between meals");
  });

  it("tells it not to answer breakfast with a fish dinner", () => {
    const prompt = buildCoachAskPrompt({ ...ARGS, slot: "breakfast", question: "something else" });
    expect(prompt).toMatch(/seared fish dinner is not\s+breakfast/);
  });

  it("does not brand lunch food as breakfast", () => {
    const prompt = buildCoachAskPrompt({ ...ARGS, slot: "breakfast", question: "ideas" });
    expect(prompt).toMatch(/Never put "breakfast"/);
    expect(prompt).toMatch(/Chicken and rice/);
    expect(prompt).toMatch(/chicken sausage/);
    expect(prompt).toMatch(/Ezekiel/);
  });

  it("tells it to answer the restaurant she named", () => {
    const prompt = buildCoachAskPrompt({
      ...ARGS,
      slot: "lunch",
      question: "I'm going out to eat at inn n out. What should I get?",
    });
    expect(prompt).toMatch(/only that restaurant's real menu/);
    expect(prompt).toMatch(/Protein Style/);
    expect(prompt).toMatch(/half the little basket/);
    expect(prompt).toMatch(/fish with some potatoes and broccoli/);
    expect(prompt).toMatch(/do not make it up/i);
    expect(prompt).toMatch(/Do not drop a canned teaching/);
  });

  it("reads today from the app, and only mentions nursing when she is", () => {
    const day = sanitizeCoachContext({
      eaten: ["breakfast: Eggs", "x".repeat(200)],
      planned: ["dinner: Salmon"],
      usual: ["Chicken bowl"],
      skipped: ["breakfast", "not-a-slot"],
      turnedDown: ["Tofu stir fry"],
      snackCount: 2,
    });
    expect(day.eaten).toHaveLength(2);
    expect(day.eaten[1].length).toBe(80);
    expect(day.skipped).toEqual(["breakfast"]);
    const prompt = buildCoachAskPrompt({
      ...ARGS,
      slot: "dinner",
      question: "what can I do with this",
      day,
      profile: { ...ARGS.profile, breastfeeding: true },
    });
    expect(prompt).toContain("breakfast: Eggs");
    expect(prompt).toContain("dinner: Salmon");
    expect(prompt).toContain("Chicken bowl");
    expect(prompt).toContain("Tofu stir fry");
    expect(prompt).toContain("2 snacks");
    expect(prompt).toMatch(/She is nursing/);
    expect(prompt).toMatch(/Do not discuss milk supply/);
    const quiet = buildCoachAskPrompt({ ...ARGS, slot: "dinner", question: "ideas" });
    expect(quiet).not.toMatch(/She is nursing/);
    expect(quiet).not.toMatch(/## Today/);
  });

  it("still carries her question, her budget and her history", () => {
    const prompt = buildCoachAskPrompt({ ...ARGS, slot: "lunch", question: "something warm" });
    expect(prompt).toContain("something warm");
    expect(prompt).toContain("Calories: about 500");
    expect(prompt).toContain("Greek yogurt + berries");
  });
});

describe("what it is allowed to write down", () => {
  it("refuses padded steps", () => {
    const prompt = buildCoachAskPrompt({ ...ARGS, slot: "dinner", question: "ideas" });
    expect(prompt).toMatch(/Never pad to a count/);
    expect(prompt).toMatch(/never end on filler/);
  });

  it("keeps a menu plate to ordering asks", () => {
    const prompt = buildCoachMenuPrompt({ ...ARGS, slot: "dinner", note: "" });
    expect(prompt).toMatch(/"steps" is the\s+ordering ask and nothing else/);
    expect(prompt).toMatch(/PS method/);
  });

  it("tells the model fat is the constraint, and that a half portion can sit beside a full one", () => {
    const prompt = buildCoachAskPrompt({ ...ARGS, slot: "dinner", question: "ideas" });
    expect(prompt).toMatch(/the one that must stay in its band/);
    expect(prompt).toMatch(/half portion is fine/);
    expect(prompt).not.toMatch(/Never suggest a half portion/);
    expect(prompt).toMatch(/Never tell her to skip a meal/);
  });
});
