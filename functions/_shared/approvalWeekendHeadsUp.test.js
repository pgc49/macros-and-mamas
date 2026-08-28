import { describe, expect, it } from "vitest";
import {
  APPROVAL_WEEKEND_COHORT,
  APPROVAL_WEEKEND_SUBJECT,
  APPROVAL_WEEKEND_TYPE,
  alreadySentSet,
  buildApprovalWeekendPayload,
  firstNameFromProfile,
  idempotencyKey,
  isCohort2AwaitingApproval,
  selectApprovalWeekendRecipients,
} from "./approvalWeekendHeadsUp.js";

const awaiting = {
  id: "p1",
  email: "alex@example.com",
  name: "alex",
  role: "client",
  status: "pending",
  paid: true,
  comp: false,
  refunded: false,
  cohort_label: APPROVAL_WEEKEND_COHORT,
};

const macrosPending = { profile_id: "p1", approved: false };

describe("cohort 2 awaiting approval audience", () => {
  it("includes paid or comp Cohort 2 mamas with intake who are not approved", () => {
    expect(isCohort2AwaitingApproval(awaiting, macrosPending)).toBe(true);
    expect(isCohort2AwaitingApproval({ ...awaiting, paid: false, comp: true }, macrosPending)).toBe(true);
  });

  it("excludes unpaid, refunded, admin, wrong cohort, no intake, and already approved", () => {
    expect(isCohort2AwaitingApproval({ ...awaiting, paid: false }, macrosPending)).toBe(false);
    expect(isCohort2AwaitingApproval({ ...awaiting, refunded: true }, macrosPending)).toBe(false);
    expect(isCohort2AwaitingApproval({ ...awaiting, role: "admin" }, macrosPending)).toBe(false);
    expect(isCohort2AwaitingApproval({ ...awaiting, cohort_label: "2026-07" }, macrosPending)).toBe(false);
    expect(isCohort2AwaitingApproval(awaiting, null)).toBe(false);
    expect(isCohort2AwaitingApproval(awaiting, { approved: true })).toBe(false);
    expect(isCohort2AwaitingApproval({ ...awaiting, status: "active" }, macrosPending)).toBe(false);
  });

  it("selects only awaiting-approval recipients and counts paid-no-intake skips", () => {
    const profiles = [
      awaiting,
      { ...awaiting, id: "p2", email: "no-intake@example.com", name: "Bianca" },
      { ...awaiting, id: "p3", email: "founding@example.com", name: "Founding", cohort_label: "2026-07" },
      { ...awaiting, id: "p4", email: "unpaid@example.com", name: "Unpaid", paid: false },
      { ...awaiting, id: "p5", email: "done@example.com", name: "Done", status: "active" },
      { ...awaiting, id: "p6", email: "Admin@example.com", name: "Callie", role: "admin" },
    ];
    const macrosByProfileId = {
      p1: macrosPending,
      p5: { approved: false },
    };
    const { recipients, skipped } = selectApprovalWeekendRecipients({
      profiles,
      macrosByProfileId,
      alreadySent: new Set(),
    });
    expect(recipients).toEqual([
      { profileId: "p1", email: "alex@example.com", firstName: "Alex" },
    ]);
    expect(skipped.paid_no_intake).toBe(1);
    expect(skipped.wrong_cohort).toBe(1);
    expect(skipped.unpaid).toBe(1);
    expect(skipped.already_approved).toBe(1);
    expect(skipped.admin).toBe(1);
  });

  it("skips addresses that already got this heads-up", () => {
    const { recipients, skipped } = selectApprovalWeekendRecipients({
      profiles: [awaiting],
      macrosByProfileId: { p1: macrosPending },
      alreadySent: alreadySentSet([
        { email_type: APPROVAL_WEEKEND_TYPE, status: "sent", to_email: "Alex@example.com" },
      ]),
    });
    expect(recipients).toEqual([]);
    expect(skipped.already_sent).toBe(1);
  });
});

describe("approval weekend copy", () => {
  it("keeps Callie's locked-in weekend note and a pending-only CTA", () => {
    const payload = buildApprovalWeekendPayload({ firstName: "claire" });
    expect(payload.emailType).toBe(APPROVAL_WEEKEND_TYPE);
    expect(payload.subject).toBe(APPROVAL_WEEKEND_SUBJECT);
    expect(payload.header).toBe("Hi Claire,");
    expect(payload.body).toMatch(/We are locked in, mama!!/);
    expect(payload.body).toMatch(/one mama at a time/);
    expect(payload.body).toMatch(/official approval email!!/);
    expect(payload.body).toMatch(/Nothing you need to do right now/);
    expect(payload.body).not.toMatch(/—/);
    expect(payload.body).not.toMatch(/\$249|lock in your spot|\/join/i);
    expect(payload.cta_text).toBe("See my pending status");
    expect(payload.cta_url).toBe("https://www.macrosandmamas.com/pending");
    expect(idempotencyKey("p1")).toBe("approval_weekend_heads_up/p1");
    expect(firstNameFromProfile({ name: "  makaela  " })).toBe("Makaela");
  });
});
