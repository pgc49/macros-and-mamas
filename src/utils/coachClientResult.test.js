import { describe, expect, it } from "vitest";

import { readCoachClientData } from "./coachClientResult.js";

const PLATE = { name: "Grilled chicken and rice", cal: 430, p: 45, c: 30, f: 12 };

describe("readCoachClientData", () => {
  it("keeps plates on a 429 instead of treating it as a wall", () => {
    const data = readCoachClientData(
      { ok: false, status: 429 },
      {
        error: "rate_limited",
        message: "That's all the thinking I've got for today. Here's Grilled chicken and rice.",
        meals: [PLATE],
        mealSource: "new",
        askCallie: true,
      },
    );
    expect(data.ok).toBe(true);
    expect(data.limited).toBe(true);
    expect(data.askCallie).toBe(true);
    expect(data.meals).toEqual([PLATE]);
    expect(data.reply).toMatch(/Grilled chicken/);
  });

  it("keeps plates on a fallback 502 body", () => {
    const data = readCoachClientData(
      { ok: false, status: 502 },
      { error: "coach unavailable", reply: "Here's Eggs and toast.", meals: [{ name: "Eggs and toast" }] },
    );
    expect(data.ok).toBe(true);
    expect(data.meals[0].name).toBe("Eggs and toast");
  });

  it("stays a failure when there are no plates", () => {
    const data = readCoachClientData(
      { ok: false, status: 502 },
      { message: "I can't think straight right now." },
    );
    expect(data.ok).toBe(false);
    expect(data.message).toMatch(/think straight/);
  });
});
