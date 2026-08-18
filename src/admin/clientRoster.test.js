import { describe, expect, it } from "vitest";
import {
  filterRoster,
  formatLastMessaged,
  listRosterCohorts,
  matchesRosterQuery,
  needsYou,
  rosterFilterCounts,
  rosterStats,
  rosterTitle,
} from "./clientRoster.js";

const mama = (over = {}) => ({
  id: "a",
  role: "client",
  name: "",
  firstName: "",
  lastName: "",
  email: "lauren@example.com",
  phone: "555-0100",
  stage: "active",
  status: "active",
  paid: true,
  hasIntake: true,
  unreadFromMama: 0,
  lastAdminAt: "2026-08-16T12:00:00.000Z",
  lastActiveDate: "2026-08-18",
  createdAt: "2026-08-01T00:00:00.000Z",
  ...over,
});

describe("rosterTitle", () => {
  it("prefers a real name over email", () => {
    expect(rosterTitle(mama({ name: "Lauren Wells" }))).toBe("Lauren Wells");
  });

  it("uses email local-part instead of New signup", () => {
    expect(rosterTitle(mama({ name: "New signup", email: "pgchammas+test@gmail.com" }))).toBe(
      "pgchammas+test",
    );
  });

  it("uses quiz first name when profile name is blank", () => {
    expect(rosterTitle(mama({ name: "", firstName: "Callie" }))).toBe("Callie");
  });
});

describe("formatLastMessaged", () => {
  const now = Date.parse("2026-08-18T15:00:00.000Z");

  it("labels a missing timestamp as never", () => {
    expect(formatLastMessaged(null, now)).toEqual({ label: "Never messaged", stale: true });
  });

  it("uses relative hours inside a day", () => {
    expect(formatLastMessaged("2026-08-18T12:00:00.000Z", now).label).toBe("3h ago");
  });
});

describe("needsYou + filterRoster", () => {
  const today = "2026-08-18";
  const unread = mama({ id: "u", name: "Ava", unreadFromMama: 2 });
  const quiet = mama({
    id: "q",
    name: "Bea",
    lastActiveDate: "2026-08-10",
    lastMealDate: "2026-08-10",
  });
  const unpaid = mama({
    id: "p",
    name: "",
    email: "new@example.com",
    stage: "signed_up",
    status: "pending",
    paid: false,
    hasIntake: false,
    lastActiveDate: null,
  });

  it("flags unread and quiet actives", () => {
    expect(needsYou(unread, today)).toBe(true);
    expect(needsYou(quiet, today)).toBe(true);
    expect(needsYou(unpaid, today)).toBe(false);
  });

  it("searches email for unpaid signups", () => {
    const list = filterRoster([unread, unpaid], "unpaid", { query: "new@", todayIso: today });
    expect(list.map((c) => c.id)).toEqual(["p"]);
    expect(matchesRosterQuery(unpaid, "new@")).toBe(true);
  });

  it("sorts unread ahead of quiet on needs-you", () => {
    const list = filterRoster([quiet, unread], "needs_you", { todayIso: today });
    expect(list.map((c) => c.id)).toEqual(["u", "q"]);
  });

  it("counts needs-you separately from unpaid", () => {
    const counts = rosterFilterCounts([unread, quiet, unpaid], today);
    expect(counts.needsYou).toBe(2);
    expect(counts.unpaid).toBe(1);
    expect(counts.active).toBe(2);
  });
});

describe("cohort filter", () => {
  const today = "2026-08-18";
  const founding = mama({
    id: "f",
    name: "Ava",
    cohort_label: "2026-07",
    stage: "active",
    status: "active",
  });
  const c2 = mama({
    id: "c2",
    name: "Dolly Chammas",
    email: "dollychammas@gmail.com",
    cohort_label: "2026-08",
    stage: "paid_awaiting_intake",
    status: "pending",
    lastActiveDate: null,
  });

  it("lists Founding and Cohort 2 when both exist", () => {
    const opts = listRosterCohorts([founding, c2]);
    expect(opts.map((o) => o.id)).toEqual(["all", "2026-07", "2026-08"]);
    expect(opts.find((o) => o.id === "2026-08").label).toBe("Cohort 2");
  });

  it("scopes the roster and stats to one cohort", () => {
    const list = filterRoster([founding, c2], "all", { todayIso: today, cohort: "2026-08" });
    expect(list.map((c) => c.id)).toEqual(["c2"]);
    const stats = rosterStats([founding, c2], "2026-08");
    expect(stats.signups).toBe(1);
    expect(stats.paid).toBe(1);
    expect(stats.active).toBe(0);
    expect(stats.awaitingIntake).toBe(1);
    expect(rosterFilterCounts([founding, c2], today, "2026-08").paid).toBe(1);
  });
});
