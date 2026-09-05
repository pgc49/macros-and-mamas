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
    expect(prompt).toMatch(/seared fish\s+dinner is not breakfast/);
  });

  it("points it at the preferences for this slot, not the others", () => {
    const prompt = buildCoachAskPrompt({ ...ARGS, slot: "breakfast", question: "ideas" });
    expect(prompt).toMatch(/match the slot named above/);
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
  });
});
