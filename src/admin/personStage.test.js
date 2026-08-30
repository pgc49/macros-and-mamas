import { describe, expect, it } from "vitest";
import { derivePersonStage, lastTouchMs, nurtureBadges } from "./personStage.js";

const NOW = Date.parse("2026-08-30T12:00:00.000Z");

describe("nurtureBadges", () => {
  it("labels leftover nurture segments without making them a stage", () => {
    expect(nurtureBadges({ segment: "pregnancy_nurture" })).toEqual(["Pregnant"]);
    expect(nurtureBadges({ segment: "waitlist_plantbased" })).toEqual(["Plant-based"]);
    expect(nurtureBadges({ segment: "early_pp_nurture" })).toEqual(["Early PP"]);
    expect(nurtureBadges({ segment: "main" })).toEqual([]);
  });
});

describe("derivePersonStage", () => {
  it("keeps nurture leftover out of cold even with no drips", () => {
    expect(derivePersonStage({
      leftover: true,
      lead: { segment: "waitlist_plantbased", created_at: "2026-07-01T00:00:00.000Z" },
      remainingDrips: 0,
      now: NOW,
    })).toBe("leftover");
  });

  it("marks leftover new when under 48h and only ranges sent", () => {
    expect(derivePersonStage({
      leftover: true,
      lead: { created_at: "2026-08-30T00:00:00.000Z", segment: "main" },
      remainingDrips: 1,
      sentBeyondRanges: false,
      now: NOW,
    })).toBe("new_lead");
  });

  it("uses nudging when leftover has remaining drips and is older than 48h", () => {
    expect(derivePersonStage({
      leftover: true,
      lead: { created_at: "2026-08-20T00:00:00.000Z", segment: "main" },
      remainingDrips: 2,
      sentBeyondRanges: true,
      now: NOW,
    })).toBe("nudging");
  });

  it("uses cold when leftover is stale, unsubscribed, or marked — not nurture", () => {
    expect(derivePersonStage({
      leftover: true,
      lead: { created_at: "2026-07-01T00:00:00.000Z", segment: "main" },
      remainingDrips: 0,
      lastEmailAt: "2026-07-10T00:00:00.000Z",
      now: NOW,
    })).toBe("cold");
    expect(derivePersonStage({
      leftover: true,
      lead: { created_at: "2026-08-01T00:00:00.000Z", segment: "main" },
      remainingDrips: 0,
      unsubscribed: true,
      now: NOW,
    })).toBe("cold");
    expect(derivePersonStage({
      leftover: true,
      lead: { created_at: "2026-08-01T00:00:00.000Z", segment: "pregnancy_nurture" },
      remainingDrips: 0,
      unsubscribed: true,
      now: NOW,
    })).toBe("leftover");
  });

  it("maps paid setup and active / alumni / refunded from the roster", () => {
    expect(derivePersonStage({
      client: { paid: true, stage: "awaiting_approval", status: "pending" },
      now: NOW,
    })).toBe("paid_needs_setup");
    expect(derivePersonStage({
      client: {
        paid: true,
        status: "active",
        stage: "active",
        cohort_label: "2026-08",
      },
      now: NOW,
    })).toBe("active");
    expect(derivePersonStage({
      client: { refunded: true, stage: "refunded", paid: true },
      now: NOW,
    })).toBe("refunded");
    expect(derivePersonStage({
      client: {
        paid: true,
        status: "active",
        stage: "active",
        cohort_label: "2026-07",
      },
      now: Date.parse("2026-11-01T00:00:00.000Z"),
    })).toBe("alumni");
  });
});

describe("lastTouchMs", () => {
  it("takes the latest of email, DM, and card touch", () => {
    expect(lastTouchMs({
      lastEmailAt: "2026-08-01T00:00:00.000Z",
      lastAdminDmAt: "2026-08-10T00:00:00.000Z",
      lastAdminTouchAt: "2026-08-20T00:00:00.000Z",
    })).toBe(Date.parse("2026-08-20T00:00:00.000Z"));
  });
});
