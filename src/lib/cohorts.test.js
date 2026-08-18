import { describe, expect, it } from "vitest";
import {
  cohortByLabel,
  defaultVoiceDropCohort,
  freeMonthEndsAt,
  hasFoundingFreeMonth,
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
