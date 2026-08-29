import { describe, expect, it } from "vitest";
import { shouldShowNotificationsTip } from "./notificationsTip";

describe("shouldShowNotificationsTip", () => {
  it("shows for Cohort 2 until they enable or dismiss", () => {
    expect(shouldShowNotificationsTip({
      cohortLabel: "2026-08",
      permission: "default",
      dismissedLocally: false,
    })).toBe(true);
  });

  it("hides for Founding", () => {
    expect(shouldShowNotificationsTip({
      cohortLabel: "2026-07",
      permission: "default",
      dismissedLocally: false,
    })).toBe(false);
  });

  it("hides once notifications are on or the card was dismissed", () => {
    expect(shouldShowNotificationsTip({
      cohortLabel: "2026-08",
      permission: "granted",
      dismissedLocally: false,
    })).toBe(false);
    expect(shouldShowNotificationsTip({
      cohortLabel: "2026-08",
      permission: "default",
      dismissedLocally: true,
    })).toBe(false);
  });
});
