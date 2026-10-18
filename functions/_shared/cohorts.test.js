import { describe, expect, it } from "vitest";
import {
  cohortByLabel,
  cohortForDate,
  freeMonthEndsAt,
  hasFoundingFreeMonth,
  mamaProgramWeekNumber,
  openEnrollmentCohort,
  programWeekNumber,
} from "./cohorts.js";

describe("shared August cohort dates", () => {
  it("keeps C2 programStart on Aug 31", () => {
    const c2 = cohortByLabel("2026-08");
    expect(c2.programStart).toBe("2026-08-31T00:00:00.000Z");
    expect(c2.programEnd).toBe("2026-10-26T00:00:00.000Z");
    expect(programWeekNumber("2026-08", "2026-08-18T12:00:00.000Z")).toBe(0);
  });

  it("does not start a personal week before ranges are approved", () => {
    expect(mamaProgramWeekNumber({
      macrosApproved: false,
      cohortLabel: "2026-07",
    }, "2026-09-04T12:00:00.000Z")).toBe(0);
  });
});

describe("founding-only free month", () => {
  it("gives Founding programEnd + 30 days (~Oct 21)", () => {
    expect(hasFoundingFreeMonth("2026-07")).toBe(true);
    expect(freeMonthEndsAt("2026-07")).toBe("2026-10-21T00:00:00.000Z");
  });

  it("does not give August or later a post-program free month", () => {
    expect(hasFoundingFreeMonth("2026-08")).toBe(false);
    expect(freeMonthEndsAt("2026-08")).toBeNull();
    expect(hasFoundingFreeMonth("2026-11")).toBe(false);
    expect(freeMonthEndsAt("2026-11")).toBeNull();
  });
});

describe("November cohort assignment", () => {
  it("keeps Week 1 on Monday Nov 2 for eight weeks", () => {
    const c3 = cohortByLabel("2026-11");
    expect(c3.displayName).toBe("November Group");
    expect(c3.programStart).toBe("2026-11-02T00:00:00.000Z");
    expect(c3.programEnd).toBe("2026-12-28T00:00:00.000Z");
    expect(programWeekNumber("2026-11", "2026-10-18T12:00:00.000Z")).toBe(0);
    expect(programWeekNumber("2026-11", "2026-11-02T12:00:00.000Z")).toBe(1);
    expect(programWeekNumber("2026-11", "2026-11-09T12:00:00.000Z")).toBe(2);
  });

  it("stamps new checkouts from Oct 18 through mid-November as Cohort 3", () => {
    expect(cohortForDate("2026-10-17T23:00:00.000Z").label).toBe("2026-08");
    expect(cohortForDate("2026-10-18T00:00:00.000Z").label).toBe("2026-11");
    expect(cohortForDate("2026-11-02T15:00:00.000Z").label).toBe("2026-11");
    expect(cohortForDate("2026-11-15T23:00:00.000Z").label).toBe("2026-11");
    expect(openEnrollmentCohort({}).label).toBe("2026-11");
  });
});
