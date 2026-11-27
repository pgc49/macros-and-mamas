import { beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "./billing.js";

const USER_ID = "00000000-0000-4000-8000-0000000000aa";

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  SUPABASE_ANON_KEY: "anon",
  STRIPE_SECRET_KEY: "sk_test",
  PRICE_ALUMNI_49: "price_alumni_49",
};

function profile(overrides = {}) {
  return {
    id: USER_ID,
    role: "client",
    paid: true,
    refunded: false,
    comp: false,
    cohort_label: "2026-11",
    tier: "alumni_49",
    stripe_customer_id: "cus_mama",
    stripe_subscription_id: "sub_mama",
    subscription_status: "active",
    subscription_current_period_end: "2026-12-27T00:00:00.000Z",
    subscription_trial_end: null,
    ...overrides,
  };
}

function request(action) {
  return new Request("https://www.macrosandmamas.com/api/billing", {
    method: "POST",
    headers: {
      authorization: "Bearer token",
      "content-type": "application/json",
    },
    body: JSON.stringify({ action }),
  });
}

function stripeSub(overrides = {}) {
  return {
    id: "sub_mama",
    status: "active",
    customer: "cus_mama",
    cancel_at_period_end: false,
    cancel_at: null,
    current_period_end: Math.floor(Date.parse("2026-12-27T00:00:00.000Z") / 1000),
    metadata: { supabase_user_id: USER_ID },
    ...overrides,
  };
}

function mockFetch({ row = profile(), live = stripeSub(), updated = null } = {}) {
  const updates = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options = {}) => {
    const value = String(url);
    const method = String(options.method || "GET").toUpperCase();
    if (value.includes("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: USER_ID, email: "mama@example.com" }), { status: 200 });
    }
    if (value.includes("/rest/v1/profiles") && method === "GET") {
      return new Response(JSON.stringify([row]), { status: 200 });
    }
    if (value.includes("/rest/v1/")) {
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    }
    if (value.includes("/v1/subscriptions/")) {
      if (method === "POST") {
        updates.push(String(options.body || ""));
        return new Response(JSON.stringify(updated || live), { status: 200 });
      }
      if (!live) return new Response(JSON.stringify({ error: { code: "resource_missing" } }), { status: 404 });
      return new Response(JSON.stringify(live), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  });
  return { updates, row };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/billing membership cancel and resume", () => {
  it("schedules cancel at period end for this mama's subscription", async () => {
    const ending = stripeSub({
      cancel_at_period_end: true,
      cancel_at: Math.floor(Date.parse("2026-12-27T00:00:00.000Z") / 1000),
    });
    const { updates } = mockFetch({ updated: ending });

    const res = await onRequestPost({ request: request("cancel"), env });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subscription.cancelAtPeriodEnd).toBe(true);
    expect(body.subscription.canResume).toBe(true);
    expect(body.subscription.canCancel).toBe(false);
    expect(updates).toHaveLength(1);
    expect(new URLSearchParams(updates[0]).get("cancel_at_period_end")).toBe("true");
  });

  it("turns a scheduled cancel back on without a new checkout", async () => {
    const live = stripeSub({ cancel_at_period_end: true });
    const resumed = stripeSub({ cancel_at_period_end: false, cancel_at: null });
    const { updates } = mockFetch({ live, updated: resumed });

    const res = await onRequestPost({ request: request("resume"), env });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subscription.canCancel).toBe(true);
    expect(body.subscription.canResume).toBe(false);
    expect(body.subscription.note).toBe("Your monthly membership is active.");
    expect(new URLSearchParams(updates[0]).get("cancel_at_period_end")).toBe("false");
  });

  it("does not call Stripe again when cancel is already scheduled", async () => {
    const { updates } = mockFetch({
      live: stripeSub({ cancel_at_period_end: true }),
    });

    const res = await onRequestPost({ request: request("cancel"), env });
    expect(res.status).toBe(200);
    expect((await res.json()).subscription.canResume).toBe(true);
    expect(updates).toHaveLength(0);
  });

  it("refuses a subscription that belongs to someone else", async () => {
    const { updates } = mockFetch({
      live: stripeSub({ customer: "cus_other", metadata: {} }),
    });

    const res = await onRequestPost({ request: request("cancel"), env });
    expect(res.status).toBe(403);
    expect(updates).toHaveLength(0);
  });

  it("tells her to subscribe again once Stripe has already ended it", async () => {
    mockFetch({ live: stripeSub({ status: "canceled", cancel_at_period_end: false }) });
    const res = await onRequestPost({ request: request("resume"), env });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      error: "This membership has already ended. Subscribe again from this page.",
    });
  });
});
