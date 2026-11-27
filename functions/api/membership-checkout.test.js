import { beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "./membership-checkout.js";

const USER_ID = "00000000-0000-4000-8000-0000000000aa";

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  SUPABASE_ANON_KEY: "anon",
  STRIPE_SECRET_KEY: "sk_test",
  PRICE_ALUMNI_49: "price_alumni_49",
};

function request() {
  return new Request("https://www.macrosandmamas.com/api/membership-checkout", {
    method: "POST",
    headers: {
      authorization: "Bearer token",
      "content-type": "application/json",
    },
    body: JSON.stringify({ cancelPath: "/dashboard" }),
  });
}

function profile(stripeCustomerId) {
  return {
    id: USER_ID,
    role: "client",
    paid: true,
    refunded: false,
    tier: "active_pod",
    cohort_label: "2026-07",
    stripe_customer_id: stripeCustomerId,
    subscription_status: null,
  };
}

function mockFetch({ stripeCustomerId, stripeResponses, profileOverrides = {}, subscription = null }) {
  const stripeCalls = [];
  const subscriptionGets = [];
  let stripeIndex = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options = {}) => {
    const value = String(url);
    if (value.includes("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: USER_ID, email: "mama@example.com" }), { status: 200 });
    }
    if (value.includes("/rest/v1/profiles")) {
      return new Response(JSON.stringify([{ ...profile(stripeCustomerId), ...profileOverrides }]), { status: 200 });
    }
    if (value.includes("/v1/subscriptions/")) {
      subscriptionGets.push(value);
      if (!subscription) return new Response(JSON.stringify({ error: { code: "resource_missing" } }), { status: 404 });
      return new Response(JSON.stringify(subscription), { status: 200 });
    }
    if (value.includes("api.stripe.com/v1/checkout/sessions")) {
      stripeCalls.push(String(options.body || ""));
      const next = stripeResponses[Math.min(stripeIndex, stripeResponses.length - 1)];
      stripeIndex += 1;
      return new Response(JSON.stringify(next.body), { status: next.status });
    }
    return new Response("not found", { status: 404 });
  });
  return { stripeCalls, subscriptionGets };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/membership-checkout", () => {
  it("does not send a guest customer id to Stripe", async () => {
    const { stripeCalls } = mockFetch({
      stripeCustomerId: "gcus_guestcustomer",
      stripeResponses: [{ status: 200, body: { id: "cs_test", url: "https://checkout.stripe.test/session" } }],
    });

    const res = await onRequestPost({ request: request(), env });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      url: "https://checkout.stripe.test/session",
      sessionId: "cs_test",
    });
    expect(stripeCalls).toHaveLength(1);
    const params = new URLSearchParams(stripeCalls[0]);
    expect(params.get("customer")).toBeNull();
    expect(params.get("customer_creation")).toBeNull();
    expect(params.get("customer_email")).toBe("mama@example.com");
    expect(params.get("mode")).toBe("subscription");
    expect(params.get("line_items[0][price]")).toBe("price_alumni_49");
  });

  it("passes a real Customer id through", async () => {
    const { stripeCalls } = mockFetch({
      stripeCustomerId: "cus_realcustomer",
      stripeResponses: [{ status: 200, body: { id: "cs_test", url: "https://checkout.stripe.test/session" } }],
    });

    const res = await onRequestPost({ request: request(), env });
    expect(res.status).toBe(200);
    const params = new URLSearchParams(stripeCalls[0]);
    expect(params.get("customer")).toBe("cus_realcustomer");
    expect(params.get("customer_creation")).toBeNull();
    expect(params.get("customer_email")).toBeNull();
  });

  it("retries without the customer when Stripe says that customer does not exist", async () => {
    const { stripeCalls } = mockFetch({
      stripeCustomerId: "cus_deletedcustomer",
      stripeResponses: [
        {
          status: 400,
          body: {
            error: {
              code: "resource_missing",
              param: "customer",
              message: "No such customer: 'cus_deletedcustomer'",
              type: "invalid_request_error",
            },
          },
        },
        { status: 200, body: { id: "cs_retry", url: "https://checkout.stripe.test/retry" } },
      ],
    });

    const res = await onRequestPost({ request: request(), env });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ url: "https://checkout.stripe.test/retry", sessionId: "cs_retry" });
    expect(stripeCalls).toHaveLength(2);
    expect(new URLSearchParams(stripeCalls[0]).get("customer")).toBe("cus_deletedcustomer");
    const retry = new URLSearchParams(stripeCalls[1]);
    expect(retry.get("customer")).toBeNull();
    expect(retry.get("customer_creation")).toBeNull();
    expect(retry.get("customer_email")).toBe("mama@example.com");
  });

  it("refuses a second checkout while a cancel is only scheduled", async () => {
    const { stripeCalls } = mockFetch({
      stripeCustomerId: "cus_realcustomer",
      stripeResponses: [],
      profileOverrides: {
        subscription_status: "active",
        stripe_subscription_id: "sub_open",
      },
      subscription: {
        id: "sub_open",
        status: "active",
        customer: "cus_realcustomer",
        cancel_at_period_end: true,
      },
    });

    const res = await onRequestPost({ request: request(), env });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "resume_available" });
    expect(stripeCalls).toHaveLength(0);
  });

  it("starts checkout again when Stripe says the old membership has ended", async () => {
    const { stripeCalls } = mockFetch({
      stripeCustomerId: "cus_realcustomer",
      stripeResponses: [{ status: 200, body: { id: "cs_again", url: "https://checkout.stripe.test/again" } }],
      profileOverrides: {
        subscription_status: "active",
        stripe_subscription_id: "sub_old",
      },
      subscription: {
        id: "sub_old",
        status: "canceled",
        customer: "cus_realcustomer",
        cancel_at_period_end: false,
      },
    });

    const res = await onRequestPost({ request: request(), env });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ url: "https://checkout.stripe.test/again" });
    expect(stripeCalls).toHaveLength(1);
  });

  it("does not open a second subscription while one is past due", async () => {
    const { stripeCalls } = mockFetch({
      stripeCustomerId: "cus_realcustomer",
      stripeResponses: [],
      profileOverrides: { subscription_status: "past_due" },
    });

    const res = await onRequestPost({ request: request(), env });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "already_subscribed" });
    expect(stripeCalls).toHaveLength(0);
  });
});
