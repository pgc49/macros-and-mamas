import { describe, expect, it } from "vitest";
import {
  filterRoster,
  formatLastMessaged,
  hasWaitingIntakeSafetyFlag,
  isDigestItem,
  isReadyToApprove,
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

  it("flags unread as interrupt, not quiet actives", () => {
    expect(needsYou(unread, today)).toBe(true);
    expect(needsYou(quiet, today)).toBe(false);
    expect(isDigestItem(quiet, today)).toBe(true);
    expect(needsYou(unpaid, today)).toBe(false);
  });

  it("searches email for unpaid signups", () => {
    const list = filterRoster([unread, unpaid], "unpaid", { query: "new@", todayIso: today });
    expect(list.map((c) => c.id)).toEqual(["p"]);
    expect(matchesRosterQuery(unpaid, "new@")).toBe(true);
  });

  it("keeps quiet on the digest list, not Needs you", () => {
    expect(filterRoster([quiet, unread], "needs_you", { todayIso: today }).map((c) => c.id)).toEqual(["u"]);
    expect(filterRoster([quiet, unread], "digest", { todayIso: today }).map((c) => c.id)).toEqual(["q"]);
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
    const readyA = mama({
      id: "a",
      name: "Ava Ready",
      stage: "awaiting_approval",
      status: "pending",
      lastActiveDate: null,
    });
    const list = filterRoster([readyA, unreadZ], "needs_you", { todayIso: today });
    expect(list.map((c) => c.id)).toEqual(["z", "a"]);
  });

  it("pins admins at the top of Active, then clients A–Z", () => {
    const patrick = mama({ id: "p", role: "admin", name: "Patrick" });
    const callie = mama({ id: "c", role: "admin", name: "Callie" });
    const unreadZ = mama({ id: "z", name: "Zoe", unreadFromMama: 3 });
    const alex = mama({ id: "x", name: "Alexandra" });
    const list = filterRoster([unreadZ, patrick, alex, callie], "active", { todayIso: today });
    expect(list.map((c) => c.id)).toEqual(["c", "p", "x", "z"]);
  });

  it("counts interrupt separately from digest and unpaid", () => {
    const counts = rosterFilterCounts([unread, quiet, unpaid], today);
    expect(counts.needsYou).toBe(1);
    expect(counts.digest).toBe(1);
    expect(counts.quiet).toBe(1);
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

describe("interrupt vs digest split", () => {
  const today = "2026-08-29";
  const readyAugust = mama({
    id: "r21",
    name: "August Ready",
    cohort_label: "2026-08",
    stage: "awaiting_approval",
    status: "pending",
    paid: true,
    hasIntake: true,
    lastActiveDate: null,
  });
  const readyFallback = mama({
    id: "rf",
    name: "Pending Fallback",
    cohort_label: "2026-08",
    stage: "signed_up",
    status: "pending",
    paid: true,
    hasIntake: true,
    lastActiveDate: null,
  });
  const foundingQuiet = mama({
    id: "fq",
    name: "Founding Quiet",
    cohort_label: "2026-07",
    stage: "active",
    status: "active",
    paid: true,
    hasIntake: true,
    lastActiveDate: "2026-08-10",
    lastMealDate: "2026-08-10",
  });
  const paidNoIntake = mama({
    id: "ni",
    name: "Paid No Intake",
    cohort_label: "2026-08",
    stage: "paid_awaiting_intake",
    status: "pending",
    paid: true,
    hasIntake: false,
    lastActiveDate: null,
  });
  const unpaidLead = mama({
    id: "ul",
    name: "Unpaid Lead",
    stage: "signed_up",
    status: "pending",
    paid: false,
    hasIntake: false,
    lastActiveDate: null,
  });
  const unreadOnly = mama({
    id: "uo",
    name: "Unread Active",
    cohort_label: "2026-07",
    unreadFromMama: 2,
  });
  const refundedPaid = mama({
    id: "rr",
    name: "Refunded",
    stage: "refunded",
    status: "pending",
    paid: true,
    hasIntake: true,
    refunded: true,
  });
  const safetyWaiting = mama({
    id: "sf",
    name: "Safety Flag",
    cohort_label: "2026-08",
    stage: "awaiting_approval",
    status: "pending",
    paid: true,
    hasIntake: true,
    pregnant: true,
    lastActiveDate: null,
  });
  const earlyBfWaiting = mama({
    id: "eb",
    name: "Early BF",
    cohort_label: "2026-08",
    stage: "awaiting_approval",
    status: "pending",
    paid: true,
    hasIntake: true,
    breastfeeding: true,
    monthsPP: 2,
    lastActiveDate: null,
  });
  const roster = [
    readyAugust,
    readyFallback,
    foundingQuiet,
    paidNoIntake,
    unpaidLead,
    unreadOnly,
    refundedPaid,
    safetyWaiting,
    earlyBfWaiting,
  ];

  it("counts only paid + intake + not approved on the ready-to-approve queue", () => {
    expect(isReadyToApprove(readyAugust)).toBe(true);
    expect(isReadyToApprove(readyFallback)).toBe(true);
    expect(isReadyToApprove(foundingQuiet)).toBe(false);
    expect(isReadyToApprove(paidNoIntake)).toBe(false);
    expect(isReadyToApprove(unpaidLead)).toBe(false);
    expect(isReadyToApprove(unreadOnly)).toBe(false);
    expect(isReadyToApprove(refundedPaid)).toBe(false);
    expect(rosterFilterCounts(roster, today).awaitingApproval).toBe(4);
    expect(rosterStats(roster).awaitingApproval).toBe(4);
  });

  it("opens the ready-to-approve queue without quiet, unpaid, or paid-no-intake", () => {
    const list = filterRoster(roster, "awaiting_approval", { todayIso: today });
    expect(list.map((c) => c.id).sort()).toEqual(["eb", "r21", "rf", "sf"]);
  });

  it("keeps Founding quiet on digest, not Needs you or ready-to-approve", () => {
    expect(needsYou(foundingQuiet, today)).toBe(false);
    expect(isDigestItem(foundingQuiet, today)).toBe(true);
    expect(needsYou(readyAugust, today)).toBe(true);
    expect(needsYou(paidNoIntake, today)).toBe(false);
    expect(isDigestItem(paidNoIntake, today)).toBe(true);
    const needs = filterRoster(roster, "needs_you", { todayIso: today });
    expect(needs.map((c) => c.id)).toEqual(expect.arrayContaining(["r21", "uo", "sf", "eb"]));
    expect(needs.map((c) => c.id)).not.toContain("fq");
    expect(needs.map((c) => c.id)).not.toContain("ni");
    expect(filterRoster(roster, "awaiting_approval", { todayIso: today }).map((c) => c.id)).not.toContain("fq");
    expect(filterRoster(roster, "digest", { todayIso: today }).map((c) => c.id).sort()).toEqual(["fq", "ni"]);
  });

  it("interrupts on pregnant / early-BF safety flags for waiting intakes", () => {
    expect(hasWaitingIntakeSafetyFlag(safetyWaiting)).toBe(true);
    expect(hasWaitingIntakeSafetyFlag(earlyBfWaiting)).toBe(true);
    expect(hasWaitingIntakeSafetyFlag(foundingQuiet)).toBe(false);
    expect(needsYou(safetyWaiting, today)).toBe(true);
    expect(needsYou(earlyBfWaiting, today)).toBe(true);
    expect(isDigestItem(safetyWaiting, today)).toBe(false);
  });

  it("leaves refunds on the Refunded filter, not Needs you", () => {
    expect(needsYou(refundedPaid, today)).toBe(false);
    expect(isDigestItem(refundedPaid, today)).toBe(false);
    expect(filterRoster(roster, "refunded", { todayIso: today }).map((c) => c.id)).toEqual(["rr"]);
  });

  it("scopes the ready-to-approve count to a cohort without mixing quiet", () => {
    expect(rosterStats(roster, "2026-07").awaitingApproval).toBe(0);
    expect(rosterStats(roster, "2026-08").awaitingApproval).toBe(4);
    expect(rosterStats(roster, "all").awaitingApproval).toBe(4);
    expect(rosterFilterCounts(roster, today, "2026-07").quiet).toBe(1);
    expect(rosterFilterCounts(roster, today, "2026-07").needsYou).toBe(1);
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
