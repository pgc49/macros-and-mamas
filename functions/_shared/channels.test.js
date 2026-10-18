import { describe, expect, it } from "vitest";
import { cohortAssignOptsForPaidProfile } from "./channels.js";
import { cohortForDate } from "./cohorts.js";

describe("cohortAssignOptsForPaidProfile", () => {
  it("keeps an existing label when the webhook is replaying an earlier payment", () => {
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

  it("puts a previously unpaid non-comp signup into the cohort open on the day she pays", () => {
    const opts = cohortAssignOptsForPaidProfile({
      cohort_label: "2026-08",
      comp: false,
      paid_at: "2026-10-18T15:00:00.000Z",
    }, new Date("2026-10-18T15:00:00.000Z"), { firstPayment: true });
    expect(opts.existingLabel).toBeUndefined();
    expect(cohortForDate(opts.at).label).toBe("2026-11");
  });

  it("keeps a complimentary member on her existing label when she pays", () => {
    expect(cohortAssignOptsForPaidProfile({
      cohort_label: "2026-08",
      comp: true,
      paid_at: "2026-10-18T15:00:00.000Z",
    }, new Date("2026-10-18T15:00:00.000Z"), { firstPayment: true })).toEqual({
      existingLabel: "2026-08",
    });
  });
});
