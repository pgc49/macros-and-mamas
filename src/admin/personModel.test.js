import { describe, expect, it } from "vitest";
import { assemblePeople, isSnoozed } from "./personModel.js";

describe("assemblePeople", () => {
  it("lets the profile win when a paid mama has no quiz row", () => {
    const people = assemblePeople({
      clients: [{
        id: "p-paid",
        email: "Founding@example.com",
        role: "client",
        name: "Ava Stone",
        paid: true,
        status: "active",
        stage: "active",
        cohort_label: "2026-07",
      }],
      leads: [],
      now: Date.parse("2026-08-30T00:00:00.000Z"),
    });
    expect(people).toHaveLength(1);
    expect(people[0].emailLower).toBe("founding@example.com");
    expect(people[0].kind).toBe("client");
    expect(people[0].profileId).toBe("p-paid");
    expect(people[0].lead).toBeNull();
  });

  it("keeps quiz-only leftover when there is no profile", () => {
    const people = assemblePeople({
      clients: [],
      leads: [{
        email: "quiz@example.com",
        first_name: "Quinn",
        last_name: "Lead",
        funnelStatus: "quiz_only",
        created_at: "2026-08-20T00:00:00.000Z",
        segment: "main",
      }],
      now: Date.parse("2026-08-30T00:00:00.000Z"),
    });
    expect(people).toHaveLength(1);
    expect(people[0].kind).toBe("lead");
    expect(people[0].leftover).toBe(true);
    expect(people[0].name).toBe("Quinn Lead");
  });

  it("excludes admins", () => {
    const people = assemblePeople({
      clients: [{ id: "a", email: "callie@example.com", role: "admin", paid: true }],
      leads: [],
    });
    expect(people).toEqual([]);
  });
});

describe("isSnoozed", () => {
  it("is true only before snoozed_until", () => {
    const now = Date.parse("2026-08-30T00:00:00.000Z");
    expect(isSnoozed({ snoozed_until: "2026-08-31T00:00:00.000Z" }, now)).toBe(true);
    expect(isSnoozed({ snoozed_until: "2026-08-29T00:00:00.000Z" }, now)).toBe(false);
    expect(isSnoozed(null, now)).toBe(false);
  });
});
