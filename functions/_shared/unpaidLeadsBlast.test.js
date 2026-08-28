import { describe, expect, it } from "vitest";
import {
  UNPAID_ONE_MORE_TYPE,
  alreadySentSet,
  buildUnpaidOneMorePayload,
  firstNameFromLead,
  selectEmailableUnpaidLeads,
  selectUnpaidRangeLeads,
  unpaidOneMorePreviewText,
  unpaidOneMoreSubject,
} from "./unpaidLeadsBlast.js";

const leads = [
  { id: "a", email: "amy@example.com", first_name: "Amy", segment: "main", created_at: "2026-08-20T00:00:00.000Z" },
  { id: "b", email: "amy@example.com", first_name: "Amy", segment: "main", created_at: "2026-08-10T00:00:00.000Z" },
  { id: "c", email: "paid@example.com", first_name: "Paid", segment: "main", created_at: "2026-08-12T00:00:00.000Z" },
  { id: "d", email: "preg@example.com", first_name: "Preg", segment: "pregnancy_nurture", created_at: "2026-08-13T00:00:00.000Z" },
  { id: "e", email: "vegan@example.com", first_name: "Vegan", segment: "waitlist_plantbased", created_at: "2026-08-14T00:00:00.000Z" },
  { id: "f", email: "unsub@example.com", first_name: "Unsub", segment: "main", created_at: "2026-08-15T00:00:00.000Z" },
  { id: "g", email: "again@example.com", first_name: "Again", segment: "early_pp_nurture", created_at: "2026-08-16T00:00:00.000Z" },
];

const profiles = [
  { email: "paid@example.com", paid: true, role: "client" },
  { email: "comp@example.com", paid: true, comp: true, role: "client" },
];

describe("unpaid range lead audience", () => {
  it("counts unique unpaid quiz emails as true leads", () => {
    const unpaid = selectUnpaidRangeLeads(leads, profiles);
    expect(unpaid.map((row) => row.email).sort()).toEqual([
      "again@example.com",
      "amy@example.com",
      "preg@example.com",
      "unsub@example.com",
      "vegan@example.com",
    ]);
  });

  it("emails only sales-eligible unpaid leads who have not already gotten this note", () => {
    const { recipients, skipped, unpaidLeads } = selectEmailableUnpaidLeads({
      leads,
      profiles,
      unsubscribed: new Set(["unsub@example.com"]),
      alreadySent: new Set(["again@example.com"]),
    });
    expect(recipients.map((row) => row.email)).toEqual(["amy@example.com"]);
    expect(recipients[0].firstName).toBe("Amy");
    expect(skipped).toEqual({
      paid: 1,
      unsubscribed: 1,
      not_sales: 2,
      already_sent: 1,
    });
    expect(unpaidLeads).toBe(5);
  });

  it("treats sent one-more events as already sent", () => {
    const sent = alreadySentSet([
      { email_type: UNPAID_ONE_MORE_TYPE, status: "sent", to_email: "Again@example.com" },
      { email_type: UNPAID_ONE_MORE_TYPE, status: "failed", to_email: "amy@example.com" },
      { email_type: "quiz_drip_7d", status: "sent", to_email: "amy@example.com" },
    ]);
    expect([...sent]).toEqual(["again@example.com"]);
  });
});

describe("one more note copy", () => {
  it("keeps Callie's short note, first name, and tonight's close", () => {
    const payload = buildUnpaidOneMorePayload({ firstName: "claire", email: "claire@example.com" });
    expect(payload.emailType).toBe(UNPAID_ONE_MORE_TYPE);
    expect(payload.subject).toBe("One last time, Claire");
    expect(payload.header).toBe("Hi, Claire!");
    expect(payload.body).toMatch(/you matter/i);
    expect(payload.body).toMatch(/DMs are open, but course registration will close tonight/);
    expect(payload.body).toMatch(/Unsubscribe/);
    expect(payload.body).not.toMatch(/—/);
    expect(payload.body).not.toMatch(/money back|refund|guarantee/i);
    expect(payload.cta_text).toBe("Lock my spot");
    expect(payload.cta_url).toContain("/join?");
    expect(payload.cta_url).toContain("claire%40example.com");

    const preview = unpaidOneMorePreviewText("claire");
    expect(preview).toMatch(/Hi, Claire!/);
    expect(preview).toMatch(/www\.macrosandmamas\.com\/join/);
    expect(unpaidOneMoreSubject("")).toBe("One last time, Mama");
  });

  it("uses the quiz first name, then the profile name", () => {
    expect(firstNameFromLead({ first_name: "claire" })).toBe("Claire");
    expect(firstNameFromLead(
      { email: "amy@example.com" },
      new Map([["amy@example.com", "amy"]]),
    )).toBe("Amy");
    expect(firstNameFromLead({ email: "none@example.com" })).toBe("Mama");
  });
});
