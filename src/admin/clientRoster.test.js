import { describe, expect, it } from "vitest";
import {
  compareNullableIso,
  filterRoster,
  formatLastMessaged,
  listLeadCohorts,
  listRosterCohorts,
  matchesRosterQuery,
  needsWeeklyNote,
  needsYou,
  rosterFilterCounts,
  rosterStats,
  rosterTitle,
  inboxDisplayName,
  adminPersonTitle,
  inboxThreadTitle,
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

  it("does not show last name twice when name is already full", () => {
    expect(rosterTitle(mama({ name: "Sarah Smith", lastName: "Smith" }))).toBe("Sarah Smith");
    expect(rosterTitle(mama({ name: "Sarah Smith Smith", lastName: "Smith" }))).toBe("Sarah Smith Smith");
    expect(rosterTitle(mama({ name: "", firstName: "Sarah Smith", lastName: "Smith" }))).toBe("Sarah Smith");
  });

  it("uses last name when the profile name is the Mama placeholder", () => {
    expect(rosterTitle(mama({ name: "Mama", firstName: "Mama", lastName: "Wells", email: "wells@example.com" })))
      .toBe("Wells");
  });
});

describe("inboxDisplayName", () => {
  it("prefers first+last from the roster and never a blanket Mama", () => {
    expect(inboxDisplayName({ name: "Christina", lastName: "Lee" })).toBe("Christina Lee");
    expect(inboxDisplayName({ name: "Chelsea", lastName: "Park" })).toBe("Chelsea Park");
  });

  it("falls back to the inbox peer when the roster row is missing", () => {
    expect(inboxDisplayName(null, { name: "Nora", lastName: "Kim", email: "nora@example.com" }))
      .toBe("Nora Kim");
    expect(inboxDisplayName(undefined)).toBe("Unnamed");
  });

  it("uses email local-part when the only name is Mama", () => {
    expect(inboxDisplayName({ name: "Mama", firstName: "Mama", email: "christina@example.com" }))
      .toBe("christina");
  });
});

describe("adminPersonTitle — shared inbox + roster helper", () => {
  it("does not render several first+last people as Mama", () => {
    const titles = [
      adminPersonTitle({ name: "Christina", lastName: "Lee" }),
      adminPersonTitle({ name: "Chelsea", lastName: "Park" }),
      adminPersonTitle({ name: "Nora", lastName: "Kim" }),
    ];
    expect(titles).toEqual(["Christina Lee", "Chelsea Park", "Nora Kim"]);
    expect(new Set(titles).size).toBe(3);
    expect(titles.every((t) => t === "Mama")).toBe(false);
  });

  it("does not double a last name that is already in name", () => {
    expect(adminPersonTitle({ name: "Sarah Smith", lastName: "Smith" })).toBe("Sarah Smith");
    expect(adminPersonTitle({ name: "Sarah Smith", last_name: "Smith" })).toBe("Sarah Smith");
    expect(rosterTitle({ name: "Sarah Smith", lastName: "Smith" })).toBe("Sarah Smith");
  });

  it("missing clientMap peer falls back to distinct email local-part or Unnamed, not Mama", () => {
    expect(inboxThreadTitle({
      clientId: "a",
      peer: { email: "christina@example.com" },
    })).toBe("christina");
    expect(inboxThreadTitle({
      clientId: "b",
      peer: { email: "chelsea@example.com" },
    })).toBe("chelsea");
    expect(inboxThreadTitle({ clientId: "c" })).toBe("Unnamed");
    const titles = ["christina", "chelsea", "Unnamed"];
    expect(new Set(titles).size).toBe(3);
    expect(titles.includes("Mama")).toBe(false);
  });

  it("uses lastMessage.sender_profile when the roster is empty", () => {
    const emptyRosterClient = null;
    expect(inboxThreadTitle({
      clientId: "c-lee",
      lastMessage: {
        sender_id: "c-lee",
        body: "hi",
        sender_profile: { id: "c-lee", name: "Christina", last_name: "Lee", email: "christina@example.com" },
      },
    }, emptyRosterClient)).toBe("Christina Lee");
    expect(inboxThreadTitle({
      clientId: "c-park",
      lastMessage: {
        sender_id: "c-park",
        body: "hey",
        sender_profile: { id: "c-park", name: "Chelsea", last_name: "Park" },
      },
    }, emptyRosterClient)).toBe("Chelsea Park");
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

  it("filters unread and quiet 3d+", () => {
    expect(filterRoster([unread, quiet, unpaid], "unread", { todayIso: today }).map((c) => c.id)).toEqual(["u"]);
    expect(filterRoster([unread, quiet, unpaid], "quiet", { todayIso: today }).map((c) => c.id)).toEqual(["q"]);
    expect(filterRoster([unread, quiet, unpaid], "needs_help", { todayIso: today }).map((c) => c.id)).toEqual(["u", "q"]);
  });

  it("drops passed quiet from Needs help until she replies", () => {
    const nowMs = Date.parse("2026-08-18T15:00:00.000Z");
    const passed = mama({
      id: "q",
      name: "Bea",
      lastActiveDate: "2026-08-10",
      lastMealDate: "2026-08-10",
      snoozedUntil: "2026-08-19T06:00:00.000Z",
    });
    expect(filterRoster([unread, passed], "needs_help", { todayIso: today, nowMs }).map((c) => c.id)).toEqual(["u"]);
    expect(filterRoster([passed], "quiet", { todayIso: today, nowMs })).toEqual([]);
    const replied = { ...passed, unreadFromMama: 1 };
    expect(filterRoster([replied], "needs_help", { todayIso: today, nowMs }).map((c) => c.id)).toEqual(["q"]);
  });

  it("sorts unread ahead of quiet on needs-you", () => {
    const list = filterRoster([quiet, unread], "needs_you", { todayIso: today });
    expect(list.map((c) => c.id)).toEqual(["u", "q"]);
  });

  it("sorts Active A–Z even when one mama has unread or is quiet", () => {
    const unreadZ = mama({ id: "z", name: "Zoe Unread", unreadFromMama: 2 });
    const quietM = mama({
      id: "m",
      name: "Mia Quiet",
      lastActiveDate: "2026-08-10",
      lastMealDate: "2026-08-10",
    });
    const neverA = mama({ id: "a", name: "Ava Never", lastAdminAt: null });
    const calmB = mama({ id: "b", name: "Bea Calm" });
    const list = filterRoster([unreadZ, quietM, neverA, calmB], "active", { todayIso: today });
    expect(list.map((c) => c.name)).toEqual(["Ava Never", "Bea Calm", "Mia Quiet", "Zoe Unread"]);
  });

  it("keeps Needs you urgency-first even when names would invert that", () => {
    const unreadZ = mama({ id: "z", name: "Zoe Unread", unreadFromMama: 2 });
    const quietA = mama({
      id: "a",
      name: "Ava Quiet",
      lastActiveDate: "2026-08-10",
      lastMealDate: "2026-08-10",
    });
    const list = filterRoster([quietA, unreadZ], "needs_you", { todayIso: today });
    expect(list.map((c) => c.id)).toEqual(["z", "a"]);
  });

  it("sorts by last messaged oldest-first, never first", () => {
    const never = mama({ id: "n", name: "Never", lastAdminAt: null });
    const old = mama({ id: "o", name: "Old", lastAdminAt: "2026-08-01T12:00:00.000Z" });
    const recent = mama({ id: "r", name: "Recent", lastAdminAt: "2026-08-18T12:00:00.000Z" });
    expect(filterRoster([recent, never, old], "active", {
      todayIso: today,
      sort: "last_messaged",
      dir: "asc",
    }).map((c) => c.id)).toEqual(["n", "o", "r"]);
    expect(filterRoster([recent, never, old], "active", {
      todayIso: today,
      sort: "last_messaged",
      dir: "desc",
    }).map((c) => c.id)).toEqual(["r", "o", "n"]);
  });

  it("sorts by last logged and signed up", () => {
    const stale = mama({ id: "s", name: "Stale", lastActiveDate: "2026-08-01", createdAt: "2026-07-01T00:00:00.000Z" });
    const fresh = mama({ id: "f", name: "Fresh", lastActiveDate: "2026-08-18", createdAt: "2026-08-10T00:00:00.000Z" });
    expect(filterRoster([fresh, stale], "active", {
      todayIso: today,
      sort: "last_logged",
      dir: "asc",
    }).map((c) => c.id)).toEqual(["s", "f"]);
    expect(filterRoster([stale, fresh], "all", {
      todayIso: today,
      sort: "signed_up",
      dir: "desc",
    }).map((c) => c.id)).toEqual(["f", "s"]);
  });

  it("lists clients who have not had a note in 7 days", () => {
    const due = mama({ id: "d", name: "Due", lastAdminAt: "2026-08-11T12:00:00.000Z" });
    const fresh = mama({ id: "f", name: "Fresh", lastAdminAt: "2026-08-16T12:00:00.000Z" });
    const never = mama({ id: "n", name: "Never", lastAdminAt: null });
    expect(needsWeeklyNote(due, today)).toBe(true);
    expect(needsWeeklyNote(fresh, today)).toBe(false);
    expect(needsWeeklyNote(never, today)).toBe(true);
    expect(filterRoster([due, fresh, never, unpaid], "needs_note", { todayIso: today }).map((c) => c.id)).toEqual(["n", "d"]);
    expect(rosterFilterCounts([due, fresh, never, unpaid], today).needsNote).toBe(2);
  });

  it("pins admins at the top of Active, then clients A–Z", () => {
    const patrick = mama({ id: "p", role: "admin", name: "Patrick" });
    const callie = mama({ id: "c", role: "admin", name: "Callie" });
    const unreadZ = mama({ id: "z", name: "Zoe", unreadFromMama: 3 });
    const alex = mama({ id: "x", name: "Alexandra" });
    const list = filterRoster([unreadZ, patrick, alex, callie], "active", { todayIso: today });
    expect(list.map((c) => c.id)).toEqual(["c", "p", "x", "z"]);
  });

  it("counts needs-you separately from unpaid", () => {
    const counts = rosterFilterCounts([unread, quiet, unpaid], today);
    expect(counts.needsYou).toBe(2);
    expect(counts.needsHelp).toBe(2);
    expect(counts.unread).toBe(1);
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
    hasIntake: false,
    lastActiveDate: null,
  });

  it("lists Founding and Cohort 2 when both exist", () => {
    const opts = listRosterCohorts([founding, c2]);
    expect(opts.map((o) => o.id)).toEqual(["all", "2026-07", "2026-08"]);
    expect(opts.find((o) => o.id === "2026-08").label).toBe("Cohort 2");
  });

  it("always offers Founding, Cohort 2, and Unassigned on Leads", () => {
    const quizOnly = { email: "bare@example.com", cohort_label: "" };
    const opts = listLeadCohorts([quizOnly]);
    expect(opts.map((o) => o.id)).toEqual(["all", "2026-07", "2026-08", "unassigned"]);
    expect(opts.find((o) => o.id === "2026-07").label).toBe("Founding");
    expect(opts.find((o) => o.id === "unassigned").label).toBe("Unassigned");
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

describe("compareNullableIso", () => {
  it("treats empty as oldest", () => {
    expect(compareNullableIso(null, "2026-08-01", "asc")).toBe(-1);
    expect(compareNullableIso(null, "2026-08-01", "desc")).toBe(1);
    expect(compareNullableIso("2026-08-10", "2026-08-01", "desc")).toBeLessThan(0);
  });
});

describe("awaiting intake + awaiting approval filters", () => {
  const today = "2026-08-18";
  const active = mama({ id: "active", name: "Erika Active" });
  const needApproval = mama({
    id: "approve",
    name: "Summer Pending",
    stage: "awaiting_approval",
    status: "pending",
    paid: true,
    hasIntake: true,
    lastActiveDate: null,
  });
  const needIntake = mama({
    id: "intake",
    name: "Dolly Needs Intake",
    stage: "paid_awaiting_intake",
    status: "pending",
    paid: true,
    hasIntake: false,
    lastActiveDate: null,
  });
  const unpaid = mama({
    id: "unpaid",
    name: "Quiz Only",
    stage: "signed_up",
    status: "pending",
    paid: false,
    hasIntake: false,
    lastActiveDate: null,
  });
  const flagOnlyIntake = mama({
    id: "flags",
    name: "Rachel Flags",
    stage: "signed_up",
    status: "pending",
    paid: true,
    hasIntake: false,
    macros: null,
    lastActiveDate: null,
  });

  it("lists paid-without-intake and submitted-unapproved on their own filters", () => {
    const roster = [active, needApproval, needIntake, unpaid, flagOnlyIntake];
    expect(filterRoster(roster, "awaiting_approval", { todayIso: today }).map((c) => c.id)).toEqual(["approve"]);
    expect(filterRoster(roster, "awaiting_intake", { todayIso: today }).map((c) => c.id).sort()).toEqual(["flags", "intake"]);
    expect(filterRoster(roster, "awaiting_approval", { todayIso: today }).some((c) => c.id === "active")).toBe(false);
    expect(filterRoster(roster, "awaiting_intake", { todayIso: today }).some((c) => c.id === "active")).toBe(false);
    const counts = rosterFilterCounts(roster, today);
    expect(counts.awaitingApproval).toBe(1);
    expect(counts.awaitingIntake).toBe(2);
  });
});

describe("complimentary members", () => {
  const today = "2026-08-18";
  const stripePaid = mama({ id: "s", name: "Stripe Mama" });
  const compMama = mama({
    id: "c",
    name: "Comp Mama",
    paid: true,
    comp: true,
    stripe_customer_id: null,
  });

  it("excludes comps from paid / revenue counts and the Paid filter", () => {
    const stats = rosterStats([stripePaid, compMama]);
    expect(stats.paid).toBe(1);
    expect(rosterFilterCounts([stripePaid, compMama], today).paid).toBe(1);
    expect(filterRoster([stripePaid, compMama], "paid", { todayIso: today }).map((c) => c.id)).toEqual(["s"]);
  });

  it("still lists comps in All / Active so Callie can approve them", () => {
    const list = filterRoster([stripePaid, compMama], "all", { todayIso: today });
    expect(list.map((c) => c.id).sort()).toEqual(["c", "s"]);
    expect(filterRoster([compMama], "active", { todayIso: today }).map((c) => c.id)).toEqual(["c"]);
  });
});
