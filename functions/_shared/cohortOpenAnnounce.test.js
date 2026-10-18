import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COHORT_OPEN_ANNOUNCE_TYPE,
  buildCohortOpenPayload,
  cohortOpenAnnounceOpen,
  cohortOpenPreviewText,
  cohortOpenSubject,
  runCohortOpenAnnounce,
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
      "plant@example.com",
      "preg@example.com",
      "summer@example.com",
    ]);
    const summer = recipients.find((row) => row.email === "summer@example.com");
    expect(summer.hasAccount).toBe(true);
    expect(summer.firstName).toBe("Summer");
    const preg = recipients.find((row) => row.email === "preg@example.com");
    expect(preg.hasAccount).toBe(false);
    expect(skipped.paid).toBe(1);
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

describe("cohortOpenAnnounceOpen", () => {
  it("stays open through 9:00 AM PT on October 20 and then stops", () => {
    expect(cohortOpenAnnounceOpen(new Date("2026-10-18T20:00:00.000Z"))).toBe(true);
    expect(cohortOpenAnnounceOpen(new Date("2026-10-20T16:00:00.000Z"))).toBe(true);
    expect(cohortOpenAnnounceOpen(new Date("2026-10-20T16:00:01.000Z"))).toBe(false);
  });
});

describe("runCohortOpenAnnounce", () => {
  const env = {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-secret",
    RESEND_API_KEY: "re_test",
  };

  function json(rows, status = 200) {
    return new Response(JSON.stringify(rows), { status });
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends to every unpaid quiz segment and unpaid account while the window is open", async () => {
    const fetchMock = vi.fn(async (url, init) => {
      const href = String(url);
      if (href.includes("/email_unsubscribes")) return json([{ email: "unsub@example.com" }]);
      if (href.includes("/marketing_leads")) return json(leads);
      if (href.includes("/profiles")) return json(profiles);
      if (href.includes("/email_events") && init?.method === "POST") return new Response(null, { status: 201 });
      if (href.includes("/email_events")) return json([]);
      if (href.includes("api.resend.com")) return json({ id: "re_1" });
      return json([]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runCohortOpenAnnounce(env, {
      now: new Date("2026-10-18T21:00:00.000Z"),
    });

    const leadUrl = fetchMock.mock.calls
      .map(([url]) => String(url))
      .find((href) => href.includes("/marketing_leads"));
    expect(leadUrl).toBeTruthy();
    expect(leadUrl).not.toContain("profile_id");
    expect(result.open).toBe(true);
    expect(result.candidates).toBe(4);
    expect(result.sent).toBe(4);
    expect(result.errors).toBe(0);
    const sentTo = fetchMock.mock.calls
      .filter(([url]) => String(url).includes("api.resend.com"))
      .map(([, init]) => JSON.parse(init.body).to[0])
      .sort();
    expect(sentTo).toEqual([
      "amy@example.com",
      "plant@example.com",
      "preg@example.com",
      "summer@example.com",
    ]);
    const summerBody = fetchMock.mock.calls
      .filter(([url]) => String(url).includes("api.resend.com"))
      .map(([, init]) => JSON.parse(init.body))
      .find((body) => body.to[0] === "summer@example.com");
    expect(summerBody.html).toMatch(/Finish checkout/);
    expect(summerBody.html).toMatch(/\/api\/unsubscribe\?/);
  });

  it("does not send after the window, and does not send when the unsubscribe list is down", async () => {
    const fetchMock = vi.fn(async () => json([]));
    vi.stubGlobal("fetch", fetchMock);

    const closed = await runCohortOpenAnnounce(env, {
      now: new Date("2026-10-21T00:00:00.000Z"),
    });
    expect(closed.open).toBe(false);
    expect(closed.sent).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes("/email_unsubscribes")) return json([], 500);
      return json([]);
    });
    const blocked = await runCohortOpenAnnounce(env, {
      now: new Date("2026-10-18T21:00:00.000Z"),
    });
    expect(blocked.open).toBe(true);
    expect(blocked.sent).toBe(0);
    expect(blocked.errors).toBe(1);
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
