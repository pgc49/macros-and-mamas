import { describe, expect, it } from "vitest";
import { filterVoiceDropNotifyRows, voiceDropSupersedeQuery } from "./voiceDropAudience.js";

const rows = [
  { id: "f1", role: "client", status: "active", refunded: false, cohort_label: "2026-07" },
  { id: "c2", role: "client", status: "active", refunded: false, cohort_label: "2026-08" },
  { id: "pending", role: "client", status: "pending", refunded: false, cohort_label: "2026-07" },
  { id: "admin", role: "admin", status: "active", refunded: false, cohort_label: "2026-07" },
];

describe("filterVoiceDropNotifyRows", () => {
  it("limits active to one cohort so Founding does not blast C2", () => {
    expect(filterVoiceDropNotifyRows(rows, {
      audience: "active",
      cohortLabel: "2026-07",
    })).toEqual(["f1"]);
  });

  it("does not notify every active mama when cohort is missing", () => {
    expect(filterVoiceDropNotifyRows(rows, { audience: "active" })).toEqual([]);
  });

  it("still targets admins only when asked", () => {
    expect(filterVoiceDropNotifyRows(rows, { audience: "admins" })).toEqual(["admin"]);
  });
});

describe("voiceDropSupersedeQuery", () => {
  it("replaces only that group's live active drop", () => {
    expect(voiceDropSupersedeQuery({
      audience: "active",
      cohortLabel: "2026-08",
    })).toEqual({
      status: "eq.published",
      audience: "eq.active",
      cohort_label: "eq.2026-08",
    });
    expect(voiceDropSupersedeQuery({
      audience: "active",
      cohortLabel: "2026-07",
    })).toEqual({
      status: "eq.published",
      audience: "eq.active",
      cohort_label: "eq.2026-07",
    });
  });

  it("does not wipe every live drop when the cohort is missing", () => {
    expect(voiceDropSupersedeQuery({ audience: "active" })).toBeNull();
  });

  it("keeps mama drops up when publishing an admin preview", () => {
    expect(voiceDropSupersedeQuery({ audience: "admins" })).toEqual({
      status: "eq.published",
      audience: "eq.admins",
    });
  });
});
