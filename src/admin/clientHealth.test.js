import { describe, expect, it } from "vitest";
import {
  clientHealthBand,
  clientHealthByCohort,
  daysSinceLastLog,
  formatLastLogged,
  matchesClientHealthFilter,
} from "./clientHealth.js";

const TODAY = "2026-08-30";

const client = (over = {}) => ({
  id: "c1",
  role: "client",
  paid: true,
  stage: "active",
  status: "active",
  unreadFromMama: 0,
  lastActiveDate: "2026-08-30",
  cohort_label: "2026-08",
  ...over,
});

describe("daysSinceLastLog + formatLastLogged", () => {
  it("treats meals/water/weigh-ins as the log, not auth", () => {
    expect(daysSinceLastLog(client({ lastActiveDate: "2026-08-27" }), TODAY)).toBe(3);
    expect(formatLastLogged(client({ lastActiveDate: "2026-08-30" }), TODAY).label).toBe("Today");
    expect(formatLastLogged(client({ lastActiveDate: "2026-08-29" }), TODAY).label).toBe("Yesterday");
    expect(formatLastLogged(client({ lastActiveDate: null, lastMealDate: null }), TODAY)).toEqual({
      label: "Never logged",
      stale: true,
    });
  });
});

describe("clientHealthBand", () => {
  it("puts unread, approval, and quiet 3d+ in needs help", () => {
    expect(clientHealthBand(client({ unreadFromMama: 1, lastActiveDate: TODAY }), TODAY)).toBe("needs_help");
    expect(clientHealthBand(client({
      stage: "awaiting_approval",
      status: "pending",
      hasIntake: true,
      lastActiveDate: TODAY,
    }), TODAY)).toBe("needs_help");
    expect(clientHealthBand(client({ lastActiveDate: "2026-08-27" }), TODAY)).toBe("needs_help");
    expect(clientHealthBand(client({ lastActiveDate: null }), TODAY)).toBe("needs_help");
  });

  it("marks yesterday/today as doing well and 2d as steady", () => {
    expect(clientHealthBand(client({ lastActiveDate: "2026-08-30" }), TODAY)).toBe("doing_well");
    expect(clientHealthBand(client({ lastActiveDate: "2026-08-29" }), TODAY)).toBe("doing_well");
    expect(clientHealthBand(client({ lastActiveDate: "2026-08-28" }), TODAY)).toBe("steady");
  });

  it("skips unpaid leftover and refunded", () => {
    expect(clientHealthBand(client({ paid: false, stage: "signed_up" }), TODAY)).toBeNull();
    expect(clientHealthBand(client({ refunded: true, stage: "refunded" }), TODAY)).toBeNull();
  });
});

describe("filters + cohort rollup", () => {
  it("matches unread and quiet filters", () => {
    expect(matchesClientHealthFilter(client({ unreadFromMama: 2 }), "unread", TODAY)).toBe(true);
    expect(matchesClientHealthFilter(client({ lastActiveDate: "2026-08-20" }), "quiet", TODAY)).toBe(true);
    expect(matchesClientHealthFilter(client({ lastActiveDate: TODAY }), "quiet", TODAY)).toBe(false);
  });

  it("rolls health counts by cohort", () => {
    const rows = clientHealthByCohort([
      client({ id: "a", cohort_label: "2026-07", lastActiveDate: TODAY }),
      client({ id: "b", cohort_label: "2026-07", unreadFromMama: 1 }),
      client({ id: "c", cohort_label: "2026-08", lastActiveDate: "2026-08-28" }),
    ], TODAY);
    const founding = rows.find((r) => r.cohort === "2026-07");
    const c2 = rows.find((r) => r.cohort === "2026-08");
    expect(founding.doing_well).toBe(1);
    expect(founding.needs_help).toBe(1);
    expect(c2.steady).toBe(1);
  });
});
