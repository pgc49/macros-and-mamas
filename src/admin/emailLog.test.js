import { describe, expect, it } from "vitest";
import {
  emailRecipient,
  emailTypeLabel,
  eventsForLeadEmail,
  filterEmailEvents,
  leadMailtoHref,
} from "./emailLog.js";

describe("emailRecipient", () => {
  it("shows first name and email for a mama send", () => {
    const who = emailRecipient({
      to_email: "dollychammas@gmail.com",
      profiles: { name: "Dolly", last_name: "Chammas", email: "dollychammas@gmail.com" },
    });
    expect(who).toEqual({
      name: "Dolly Chammas",
      email: "dollychammas@gmail.com",
      coach: false,
    });
  });

  it("falls back to the address when the profile is missing", () => {
    const who = emailRecipient({
      to_email: "pgchammas+tteeesst@gmail.com",
      email_type: "finish_joining_1h",
    });
    expect(who.email).toBe("pgchammas+tteeesst@gmail.com");
    expect(who.name).toBe("pgchammas+tteeesst");
  });

  it("labels Callie notifies as Callie", () => {
    const who = emailRecipient({ to_email: "callie", email_type: "callie_intake" });
    expect(who.name).toBe("Callie");
    expect(who.coach).toBe(true);
  });
});

describe("emailTypeLabel", () => {
  it("distinguishes a message email from a blank type", () => {
    expect(emailTypeLabel({ email_type: "message", meta: { route: "admin_to_mama" } }))
      .toBe("Message to mama");
    expect(emailTypeLabel({ email_type: "welcome" })).toBe("Welcome");
    expect(emailTypeLabel({ email_type: "quiz_drip_2d" })).toBe("Quiz drip (+2d)");
    expect(emailTypeLabel({ email_type: "quiz_pregnancy_note" })).toBe("Quiz pregnancy note (+3d)");
    expect(emailTypeLabel({ email_type: "approval_weekend_heads_up" })).toBe("Approval weekend heads-up");
  });
});

describe("filterEmailEvents", () => {
  const rows = [
    {
      id: "1",
      email_type: "welcome",
      to_email: "dollychammas@gmail.com",
      subject: "You're in, mama",
      profiles: { name: "Dolly", last_name: "Chammas" },
    },
    {
      id: "2",
      email_type: "quiz_drip_2d",
      to_email: "lead@example.com",
      subject: "the numbers are the easy part",
    },
    {
      id: "3",
      email_type: "callie_intake",
      to_email: "callie",
    },
  ];

  it("filters by name, email, or type", () => {
    expect(filterEmailEvents(rows, "dolly").map((r) => r.id)).toEqual(["1"]);
    expect(filterEmailEvents(rows, "lead@").map((r) => r.id)).toEqual(["2"]);
    expect(filterEmailEvents(rows, "quiz drip").map((r) => r.id)).toEqual(["2"]);
    expect(filterEmailEvents(rows, "welcome").map((r) => r.id)).toEqual(["1"]);
    expect(filterEmailEvents(rows, "").map((r) => r.id)).toEqual(["1", "2", "3"]);
  });
});

describe("eventsForLeadEmail", () => {
  const rows = [
    { id: "drip", email_type: "quiz_drip_2d", to_email: "Ellie@Example.com", profile_id: null },
    { id: "welcome", email_type: "welcome", to_email: "ellie@example.com", profile_id: "p1" },
    { id: "other", email_type: "quiz_ranges", to_email: "other@example.com" },
    { id: "callie", email_type: "callie_payment", to_email: "callie", profile_id: "p1" },
  ];

  it("matches by case-insensitive to_email, including quiz-only sends", () => {
    expect(eventsForLeadEmail(rows, "ELLIE@example.com").map((r) => r.id)).toEqual(["drip", "welcome"]);
  });

  it("does not use profile_id and skips Callie notifies", () => {
    expect(eventsForLeadEmail(rows, "ellie@example.com").some((r) => r.to_email === "callie")).toBe(false);
    expect(eventsForLeadEmail(rows, "")).toEqual([]);
  });
});

describe("leadMailtoHref", () => {
  it("prefills To and a simple subject with no body", () => {
    expect(leadMailtoHref("ellie@example.com")).toBe(
      "mailto:ellie@example.com?subject=Macros%20and%20Mamas",
    );
    expect(leadMailtoHref("  ")).toBe("");
    expect(leadMailtoHref("not-an-email")).toBe("");
  });

  it("can prefill a personal subject and body", () => {
    expect(leadMailtoHref("ellie@example.com", {
      subject: "Quick note from Callie",
      body: "Hi Ellie,\n\nCallie",
    })).toBe(
      "mailto:ellie@example.com?subject=Quick%20note%20from%20Callie&body=Hi%20Ellie%2C%0A%0ACallie",
    );
  });
});
