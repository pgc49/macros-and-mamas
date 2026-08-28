import { describe, expect, it } from "vitest";
import {
  countPaidToday,
  countQuizLeads,
  countUnpaidSignups,
  loadQuizFunnelPulse,
  pacificTodayStartIso,
  summarizeOpenFunnel,
  summarizeQuizFunnel,
} from "./quizFunnel";

const START = "2026-08-19T07:00:00.000Z"; // Pacific midnight Aug 19 (PDT)

describe("pacificTodayStartIso", () => {
  it("uses Pacific midnight, not UTC midnight", () => {
    expect(pacificTodayStartIso(new Date("2026-08-19T10:00:00.000Z"))).toBe(START);
    expect(pacificTodayStartIso(new Date("2026-08-19T06:00:00.000Z"))).toBe(
      "2026-08-18T07:00:00.000Z",
    );
  });
});

describe("funnel count filters", () => {
  const leads = [
    { id: "old", created_at: "2026-08-18T20:00:00.000Z" },
    { id: "today-a", created_at: "2026-08-19T07:00:00.000Z" },
    { id: "today-b", created_at: "2026-08-19T18:00:00.000Z" },
  ];
  const profiles = [
    { id: "admin", role: "admin", paid: false, created_at: "2026-08-19T12:00:00.000Z" },
    { id: "old-unpaid", role: "client", paid: false, created_at: "2026-08-18T12:00:00.000Z" },
    { id: "new-unpaid", role: "client", paid: false, created_at: "2026-08-19T15:00:00.000Z" },
    { id: "paid-yesterday", role: "client", paid: true, created_at: "2026-08-10T00:00:00.000Z", paid_at: "2026-08-18T12:00:00.000Z" },
    { id: "paid-today", role: "client", paid: true, created_at: "2026-08-19T08:00:00.000Z", paid_at: "2026-08-19T16:00:00.000Z" },
    { id: "paid-no-stamp", role: "client", paid: true, created_at: "2026-08-19T09:00:00.000Z", paid_at: null },
  ];

  it("counts quiz leads created today PT", () => {
    expect(countQuizLeads(leads, START)).toBe(2);
  });

  it("counts unpaid non-admin profiles created today PT", () => {
    expect(countUnpaidSignups(profiles, START)).toBe(1);
  });

  it("counts paid non-admin profiles by paid_at today PT", () => {
    expect(countPaidToday(profiles, START)).toBe(1);
  });

  it("summarizes the three pulse numbers from the same filters", () => {
    expect(summarizeQuizFunnel({ leads, profiles, startIso: START })).toEqual({
      startIso: START,
      quizLeads: 2,
      unpaidSignups: 1,
      paid: 1,
      rangesSubmitted: 0,
      unpaidLeads: 0,
      paidFromQuiz: 0,
    });
  });
});

describe("open funnel (true leads)", () => {
  it("counts unique quiz emails that submitted ranges and have not paid", () => {
    const open = summarizeOpenFunnel({
      leads: [
        { email: "Amy@example.com" },
        { email: "amy@example.com" },
        { email: "paid@example.com" },
        { email: "skip@example.com" },
      ],
      profiles: [
        { email: "paid@example.com", paid: true, role: "client" },
        { email: "comp@example.com", paid: false, comp: true, role: "client" },
      ],
    });
    expect(open).toEqual({
      rangesSubmitted: 3,
      unpaidLeads: 2,
      paidFromQuiz: 1,
    });
  });
});

function mockClient({ counts, leads = [], profiles = [] }) {
  const calls = [];
  return {
    calls,
    from(table) {
      const q = {
        table,
        filters: {},
        head: false,
        select(_cols, opts) {
          q.head = Boolean(opts?.head);
          return q;
        },
        eq(key, value) {
          q.filters[`eq.${key}`] = value;
          return q;
        },
        neq(key, value) {
          q.filters[`neq.${key}`] = value;
          return q;
        },
        gte(key, value) {
          q.filters[`gte.${key}`] = value;
          return q;
        },
        then(resolve) {
          calls.push({ table: q.table, filters: { ...q.filters }, head: q.head });
          if (q.head) {
            const key = q.table === "marketing_leads"
              ? "quizLeads"
              : q.filters["eq.paid"] === true
                ? "paid"
                : "unpaidSignups";
            resolve({ count: counts[key] ?? 0, error: null });
            return;
          }
          resolve({
            data: q.table === "marketing_leads" ? leads : profiles,
            error: null,
          });
        },
      };
      return q;
    },
  };
}

describe("loadQuizFunnelPulse", () => {
  it("queries today's PT window and the all-time unpaid range funnel", async () => {
    const client = mockClient({
      counts: { quizLeads: 4, unpaidSignups: 2, paid: 1 },
      leads: [
        { email: "amy@example.com" },
        { email: "paid@example.com" },
      ],
      profiles: [
        { email: "paid@example.com", paid: true, role: "client" },
      ],
    });
    const pulse = await loadQuizFunnelPulse({
      now: new Date("2026-08-19T10:00:00.000Z"),
      client,
    });

    expect(pulse).toEqual({
      startIso: START,
      quizLeads: 4,
      unpaidSignups: 2,
      paid: 1,
      rangesSubmitted: 2,
      unpaidLeads: 1,
      paidFromQuiz: 1,
    });
    expect(client.calls.filter((c) => c.head)).toEqual([
      { table: "marketing_leads", filters: { "gte.created_at": START }, head: true },
      {
        table: "profiles",
        filters: { "eq.paid": false, "neq.role": "admin", "gte.created_at": START },
        head: true,
      },
      {
        table: "profiles",
        filters: { "eq.paid": true, "neq.role": "admin", "gte.paid_at": START },
        head: true,
      },
    ]);
  });
});
