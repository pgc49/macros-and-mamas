import { describe, expect, it } from "vitest";
import {
  COHORT_OPEN_ANNOUNCE_TYPE,
  buildCohortOpenPayload,
  cohortOpenPreviewText,
  cohortOpenSubject,
  selectCohortOpenRecipients,
} from "./cohortOpenAnnounce.js";

const leads = [
  { id: "lead-amy", email: "amy@example.com", first_name: "amy", segment: "main", created_at: "2026-09-02T00:00:00.000Z" },
  { id: "lead-paid", email: "paid@example.com", first_name: "Paid", segment: "main", created_at: "2026-09-02T00:00:00.000Z" },
  { id: "lead-preg", email: "preg@example.com", first_name: "Preg", segment: "pregnancy_nurture", created_at: "2026-09-03T00:00:00.000Z" },
  { id: "lead-plant", email: "plant@example.com", first_name: "Plant", segment: "waitlist_plantbased", created_at: "2026-09-04T00:00:00.000Z" },
  { id: "lead-qa", email: "pgchammas+qa@gmail.com", first_name: "QA", segment: "main", created_at: "2026-09-05T00:00:00.000Z" },
  { id: "lead-unsub", email: "unsub@example.com", first_name: "Unsub", segment: "main", created_at: "2026-09-06T00:00:00.000Z" },
];

const profiles = [
  { id: "p-paid", email: "paid@example.com", name: "Paid Mama", paid: true, role: "client" },
  { id: "p-comp", email: "comp@example.com", name: "Comp Mama", comp: true, role: "client" },
  { id: "p-old", email: "summer@example.com", name: "Summer Wick", paid: false, comp: false, refunded: false, role: "client" },
  { id: "p-qa", email: "pgchammas+signup@gmail.com", name: "QA Signup", paid: false, role: "client" },
  { id: "p-admin", email: "owner@example.com", name: "Owner", role: "admin", paid: true },
];

describe("selectCohortOpenRecipients", () => {
  it("includes unpaid quiz leads and unpaid accounts, once each", () => {
    const { recipients, skipped } = selectCohortOpenRecipients({
      leads: [
        ...leads,
        { id: "lead-summer", email: "summer@example.com", first_name: "Quiz", segment: "main", created_at: "2026-08-01T00:00:00.000Z" },
      ],
      profiles,
      unsubscribed: new Set(["unsub@example.com"]),
      alreadySent: new Set(),
    });
    expect(recipients.map((row) => row.email).sort()).toEqual([
      "amy@example.com",
      "summer@example.com",
    ]);
    const summer = recipients.find((row) => row.email === "summer@example.com");
    expect(summer.hasAccount).toBe(true);
    expect(summer.firstName).toBe("Summer");
    expect(skipped.paid).toBe(1);
    expect(skipped.not_sales).toBe(2);
    expect(skipped.qa).toBe(2);
    expect(skipped.unsubscribed).toBe(1);
  });

  it("does not email a complimentary or refunded address", () => {
    const { recipients } = selectCohortOpenRecipients({
      leads: [{ id: "c", email: "comp@example.com", first_name: "Comp", segment: "main", created_at: "2026-09-01T00:00:00.000Z" }],
      profiles: [
        { id: "p", email: "comp@example.com", comp: true, paid: false, role: "client" },
        { id: "r", email: "back@example.com", refunded: true, paid: false, role: "client", name: "Back" },
      ],
    });
    expect(recipients).toEqual([]);
  });
});

describe("cohort open copy", () => {
  it("names November 2, the quiz rate, and the stories link", () => {
    const payload = buildCohortOpenPayload({ firstName: "claire", email: "claire@example.com" });
    expect(payload.emailType).toBe(COHORT_OPEN_ANNOUNCE_TYPE);
    expect(payload.subject).toBe(cohortOpenSubject("claire"));
    expect(payload.subject).toBe("Claire, a new group starts November 2");
    expect(payload.subject).not.toMatch(/your ranges/i);
    expect(payload.body).toMatch(/Monday, November 2/);
    expect(payload.body).toMatch(/\$249/);
    expect(payload.body).toMatch(/\$299/);
    expect(payload.body).toMatch(/https:\/\/www\.macrosandmamas\.com\/#stories/);
    expect(payload.body).not.toMatch(/—/);
    expect(payload.body).not.toMatch(/nearly 80|doors close|August 31/i);
    expect(payload.cta_text).toBe("Lock my spot");
    expect(payload.cta_url).toContain("email=claire%40example.com");
    expect(cohortOpenPreviewText("claire")).toMatch(/#stories/);
  });

  it("asks an unpaid account to finish checkout", () => {
    const payload = buildCohortOpenPayload({
      firstName: "Summer",
      email: "summer@example.com",
      hasAccount: true,
    });
    expect(payload.cta_text).toBe("Finish checkout");
  });
});
