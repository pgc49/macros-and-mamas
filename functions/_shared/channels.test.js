import { describe, expect, it } from "vitest";
import { cohortAssignOptsForPaidProfile } from "./channels.js";
import { cohortForDate } from "./cohorts.js";

describe("cohortAssignOptsForPaidProfile", () => {
  it("keeps an existing label", () => {
    expect(cohortAssignOptsForPaidProfile({
      cohort_label: "2026-07",
      paid_at: "2026-08-15T00:00:00.000Z",
    })).toEqual({ existingLabel: "2026-07" });
  });

  it("uses paid_at so a Founding payment is not stamped C2", () => {
    const opts = cohortAssignOptsForPaidProfile({
      cohort_label: null,
      paid_at: "2026-07-22T18:00:00.000Z",
    });
    expect(opts.at).toBe("2026-07-22T18:00:00.000Z");
    expect(cohortForDate(opts.at).label).toBe("2026-07");
  });

  it("stamps C2 when paid_at is in the August window", () => {
    const opts = cohortAssignOptsForPaidProfile({
      cohort_label: "",
      paid_at: "2026-08-12T00:00:00.000Z",
    });
    expect(cohortForDate(opts.at).label).toBe("2026-08");
  });
});
