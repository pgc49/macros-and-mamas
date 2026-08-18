import { describe, expect, it } from "vitest";
import { cohortByLabel, programWeekNumber } from "./cohorts.js";

describe("shared August cohort dates", () => {
  it("keeps C2 programStart on Aug 31", () => {
    const c2 = cohortByLabel("2026-08");
    expect(c2.programStart).toBe("2026-08-31T00:00:00.000Z");
    expect(c2.programEnd).toBe("2026-10-26T00:00:00.000Z");
    expect(programWeekNumber("2026-08", "2026-08-18T12:00:00.000Z")).toBe(0);
  });
});
