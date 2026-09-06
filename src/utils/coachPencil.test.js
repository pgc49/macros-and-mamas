import { describe, expect, it } from "vitest";

import { emptyWeekPlan } from "./weekPlan.js";
import { planDayLabel } from "./dates.js";
import { writeCoachPencil } from "./coachPencil.js";

const CARD = {
  name: "Chicken bowl",
  source: "bank",
  cal: 430,
  p: 45,
  c: 30,
  f: 12,
  servings: 1,
};

describe("pencilling a coach card into the week plan", () => {
  it("lands on the same day key Today uses to read the plan", () => {
    const sunday = "2026-09-06";
    expect(planDayLabel(sunday)).toBe("Sun");

    const { days, meal } = writeCoachPencil(emptyWeekPlan(), planDayLabel(sunday), CARD, "dinner");
    const sun = days.find((d) => d.day === "Sun");
    expect(sun.meals.some((m) => m.name === "Chicken bowl" && m.via === "coach")).toBe(true);
    expect(meal.via).toBe("coach");
    expect(days.find((d) => d.day === "Sat")?.meals || []).toHaveLength(0);
  });

  it("maps the habit-check weekday key so a leftover S2 still lands on Sunday", () => {
    const { days } = writeCoachPencil(emptyWeekPlan(), "S2", CARD, "dinner");
    expect(days.find((d) => d.day === "Sun")?.meals.some((m) => m.name === "Chicken bowl")).toBe(true);
  });
});
