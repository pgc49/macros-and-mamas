import { describe, expect, it } from "vitest";
import {
  clientHealthBand,
  clientHealthByCohort,
  daysSinceLastLog,
  formatLastLogged,
  isAwaitingApproval,
  isAwaitingIntake,
  isUnpaidSignup,
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

describe("isAwaitingApproval + isAwaitingIntake", () => {
  it("flags submitted-unapproved as need approval, not need intake", () => {
    const summer = client({
      name: "Summer",
      stage: "awaiting_approval",
      status: "pending",
      paid: true,
      hasIntake: true,
    });
    expect(isAwaitingApproval(summer)).toBe(true);
    expect(isAwaitingIntake(summer)).toBe(false);
  });

  it("flags paid or comp without intake as need intake", () => {
    const paidNoIntake = client({
      stage: "paid_awaiting_intake",
      status: "pending",
      paid: true,
      hasIntake: false,
      macros: null,
    });
    const compNoIntake = client({
      stage: "signed_up",
      status: "pending",
      paid: false,
      comp: true,
      hasIntake: false,
      macros: null,
    });
    expect(isAwaitingIntake(paidNoIntake)).toBe(true);
    expect(isAwaitingIntake(compNoIntake)).toBe(true);
    expect(isAwaitingApproval(paidNoIntake)).toBe(false);
  });

  it("does not flag approved or active mamas", () => {
    expect(isAwaitingApproval(client())).toBe(false);
    expect(isAwaitingIntake(client())).toBe(false);
    expect(isUnpaidSignup(client())).toBe(false);
    expect(isAwaitingIntake(client({ paid: true, hasIntake: true, macros: { approved: true } }))).toBe(false);
  });

  it("flags an unpaid account signup, not a paid or comp mama", () => {
    const unpaid = client({
      name: "New Mama",
      stage: "signed_up",
      status: "pending",
      paid: false,
      comp: false,
      hasIntake: false,
      macros: null,
    });
    expect(isUnpaidSignup(unpaid)).toBe(true);
    expect(isAwaitingIntake(unpaid)).toBe(false);
    expect(isAwaitingApproval(unpaid)).toBe(false);
    expect(isUnpaidSignup(client({
      stage: "signed_up",
      status: "pending",
      paid: false,
      comp: true,
      hasIntake: false,
      macros: null,
    }))).toBe(false);
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

  it("drops passed quiet from needs help until she replies", () => {
    const now = Date.parse("2026-08-30T18:00:00.000Z");
    const passed = client({
      lastActiveDate: "2026-08-20",
      snoozedUntil: "2026-08-31T06:00:00.000Z",
    });
    const replied = client({
      lastActiveDate: "2026-08-20",
      snoozedUntil: "2026-08-31T06:00:00.000Z",
      unreadFromMama: 1,
    });
    expect(clientHealthBand(passed, TODAY, now)).toBeNull();
    expect(matchesClientHealthFilter(passed, "needs_help", TODAY, now)).toBe(false);
    expect(matchesClientHealthFilter(passed, "quiet", TODAY, now)).toBe(false);
    expect(clientHealthBand(replied, TODAY, now)).toBe("needs_help");
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

  it("drops QA plus-address accounts from health, unread, and unpaid", () => {
    const qa = client({
      id: "qa",
      email: "pgchammas+qa-quiz@gmail.com",
      unreadFromMama: 2,
      lastActiveDate: "2026-08-20",
    });
    const hold = client({
      id: "hold",
      email: "pgchammas+hold322a@gmail.com",
      paid: false,
      stage: "signed_up",
      status: "pending",
    });
    expect(isUnpaidSignup(hold)).toBe(false);
    expect(matchesClientHealthFilter(qa, "unread", TODAY)).toBe(false);
    expect(clientHealthBand(qa, TODAY)).toBeNull();
    expect(clientHealthByCohort([qa, hold, client({ id: "mama", email: "nora@example.com" })], TODAY)
      .find((r) => r.cohort === "2026-08")?.doing_well).toBe(1);
  });
});
