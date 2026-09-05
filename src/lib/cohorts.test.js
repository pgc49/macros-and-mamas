import { describe, expect, it } from "vitest";
import {
  cohortByLabel,
  defaultVoiceDropCohort,
  freeMonthEndsAt,
  hasFoundingFreeMonth,
  mamaProgramStartWeekIso,
  mamaProgramWeekNumber,
  programStartWeekIso,
  programWeekNumber,
  resolveProgramStartWeekIso,
} from "./cohorts";
import { parseLiveChannelCohorts } from "./liveChannelCohorts";

describe("August cohort program clock", () => {
  it("locks C2 Week 1 to Monday Aug 31", () => {
    const c2 = cohortByLabel("2026-08");
    expect(c2.programStart).toBe("2026-08-31T00:00:00.000Z");
    expect(c2.programEnd).toBe("2026-10-26T00:00:00.000Z");
    expect(programStartWeekIso("2026-08")).toBe("2026-08-31");
    expect(programWeekNumber("2026-08", "2026-08-18T15:00:00.000Z")).toBe(0);
    expect(programWeekNumber("2026-08", "2026-08-31T12:00:00.000Z")).toBe(1);
    expect(programWeekNumber("2026-08", "2026-09-07T12:00:00.000Z")).toBe(2);
  });

  it("does not fall a C2 mama back to Founding Week 4", () => {
    expect(resolveProgramStartWeekIso("2026-08", "2026-08-18T15:00:00.000Z")).toBe("2026-08-31");
    expect(resolveProgramStartWeekIso("2026-07", "2026-08-18T15:00:00.000Z")).toBe("2026-07-27");
  });

  it("does not treat an unlabeled September signup as Founding week 6", () => {
    expect(resolveProgramStartWeekIso(null, "2026-09-04T18:00:00.000Z")).toBe("2026-08-31");
  });
});

describe("personal week starts at macro approval", () => {
  it("is not started until Callie approves ranges", () => {
    expect(mamaProgramWeekNumber({
      macrosApproved: false,
      cohortLabel: "2026-07",
    }, "2026-09-04T18:00:00.000Z")).toBe(0);
    expect(mamaProgramStartWeekIso({
      macrosApproved: false,
      cohortLabel: "2026-07",
    })).toBeNull();
  });

  it("starts Week 1 on the Monday of the approval week", () => {
    expect(mamaProgramStartWeekIso({
      macrosApproved: true,
      approvedAt: "2026-09-04T18:56:00.000Z",
      cohortLabel: "2026-08",
    })).toBe("2026-08-31");
    expect(mamaProgramWeekNumber({
      macrosApproved: true,
      approvedAt: "2026-09-04T18:56:00.000Z",
      cohortLabel: "2026-08",
    }, "2026-09-04T19:00:00.000Z")).toBe(1);
    expect(mamaProgramWeekNumber({
      macrosApproved: true,
      approvedAt: "2026-09-04T18:56:00.000Z",
      cohortLabel: "2026-08",
    }, "2026-09-07T12:00:00.000Z")).toBe(2);
  });

  it("keeps founding calendar weeks when approved_at is missing", () => {
    expect(mamaProgramWeekNumber({
      macrosApproved: true,
      approvedAt: null,
      cohortLabel: "2026-07",
    }, "2026-09-04T12:00:00.000Z")).toBe(6);
  });
});

describe("founding-only free month", () => {
  it("keeps Founding free month through Oct 21", () => {
    expect(hasFoundingFreeMonth("2026-07")).toBe(true);
    expect(freeMonthEndsAt("2026-07")).toBe("2026-10-21T00:00:00.000Z");
  });

  it("does not give August a post-program free month", () => {
    expect(hasFoundingFreeMonth("2026-08")).toBe(false);
    expect(freeMonthEndsAt("2026-08")).toBeNull();
  });
});

describe("defaultVoiceDropCohort", () => {
  it("uses the roster filter when a group is selected", () => {
    expect(defaultVoiceDropCohort("2026-08")).toBe("2026-08");
  });

  it("does not default All groups to every cohort", () => {
    expect(defaultVoiceDropCohort("all", "2026-08-18T15:00:00.000Z")).toBe("2026-07");
  });
});

describe("parseLiveChannelCohorts", () => {
  it("includes August when the env default is used", () => {
    expect([...parseLiveChannelCohorts()]).toEqual(["2026-07", "2026-08"]);
    expect(parseLiveChannelCohorts("2026-07").has("2026-08")).toBe(false);
  });
});
