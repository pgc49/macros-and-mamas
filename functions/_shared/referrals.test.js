import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractPromotionCodeId,
  promotionCodeIdFromSessionObject,
} from "./referrals.js";
import { chargedAmountUsd } from "../api/stripe-webhook.js";

const KRISTEN_PROMO = "promo_1U5sl7RyN0PahoiMIMa2a4hE";
const MEGAN_PROMO = "promo_1U3nx6TypedOnJoinPath";
const INVALID_EXPAND = "total_details.breakdown.discounts.discount.promotion_code";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResp(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe("promotionCodeIdFromSessionObject", () => {
  it("reads a typed-on-Checkout promo string from session.discounts", () => {
    expect(promotionCodeIdFromSessionObject({
      id: "cs_live_alex",
      metadata: { amount_usd: "249" },
      discounts: [{ coupon: null, promotion_code: KRISTEN_PROMO }],
    })).toBe(KRISTEN_PROMO);
  });

  it("reads an expanded promotion_code object", () => {
    expect(promotionCodeIdFromSessionObject({
      discounts: [{ promotion_code: { id: KRISTEN_PROMO, code: "KRISTEN25" } }],
    })).toBe(KRISTEN_PROMO);
  });

  it("reads total_details.breakdown.discounts when session.discounts is empty", () => {
    expect(promotionCodeIdFromSessionObject({
      discounts: [],
      total_details: {
        breakdown: {
          discounts: [{
            amount: 2500,
            discount: { promotion_code: KRISTEN_PROMO },
          }],
        },
      },
    })).toBe(KRISTEN_PROMO);
  });
});

describe("extractPromotionCodeId", () => {
  it("uses webhook discounts when referral metadata is missing (no retrieve)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const id = await extractPromotionCodeId(
      { STRIPE_SECRET_KEY: "sk_live_test" },
      {
        id: "cs_live_b19qAyCtw3NjKTb0El5DNYBgKbxs5QKxHEV8jGZu2cMXKo1QCmo0Y0Fdto",
        metadata: { amount_usd: "249" },
        discounts: [{ coupon: null, promotion_code: KRISTEN_PROMO }],
      },
    );

    expect(id).toBe(KRISTEN_PROMO);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still uses metadata.referral_promo_id when the payload has no discounts", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const id = await extractPromotionCodeId(
      { STRIPE_SECRET_KEY: "sk_live_test" },
      {
        id: "cs_live_jennifer",
        metadata: { referral_promo_id: MEGAN_PROMO, referral_code: "MEGAN25" },
      },
    );

    expect(id).toBe(MEGAN_PROMO);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retrieves with only discounts.promotion_code and still parses a 400 on the old 5-level expand", async () => {
    const fetchMock = vi.fn(async (url) => {
      const href = String(url);
      expect(href).not.toContain(INVALID_EXPAND);
      if (href.includes("expand[]=discounts.promotion_code")) {
        return jsonResp({
          discounts: [{ promotion_code: { id: KRISTEN_PROMO } }],
        });
      }
      return jsonResp({ error: { message: "unexpected" } }, { ok: false, status: 400 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const id = await extractPromotionCodeId(
      { STRIPE_SECRET_KEY: "sk_live_test" },
      { id: "cs_live_alex", metadata: { amount_usd: "249" } },
    );

    expect(id).toBe(KRISTEN_PROMO);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("expand[]=discounts.promotion_code");
  });

  it("falls back to an unexpanded retrieve when the expand call fails", async () => {
    const fetchMock = vi.fn(async (url) => {
      const href = String(url);
      expect(href).not.toContain(INVALID_EXPAND);
      if (href.includes("expand[]=")) {
        return jsonResp(
          { error: { message: "You cannot expand more than 4 levels of a property." } },
          { ok: false, status: 400 },
        );
      }
      return jsonResp({
        discounts: [{ coupon: null, promotion_code: KRISTEN_PROMO }],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const id = await extractPromotionCodeId(
      { STRIPE_SECRET_KEY: "sk_live_test" },
      { id: "cs_live_alex", metadata: {} },
    );

    expect(id).toBe(KRISTEN_PROMO);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).not.toContain("expand[]=");
  });
});

describe("chargedAmountUsd", () => {
  it("uses charged amount_total, not list metadata.amount_usd", () => {
    expect(chargedAmountUsd({
      amount_total: 22400,
      amount_subtotal: 24900,
      amount_discount: 2500,
      metadata: { amount_usd: "249" },
    })).toBe(224);
  });

  it("falls back to metadata.amount_usd only when amount_total is missing", () => {
    expect(chargedAmountUsd({
      metadata: { amount_usd: "249" },
    })).toBe(249);
  });

  it("returns the missing sentinel when neither amount is present", () => {
    expect(chargedAmountUsd({}, 0)).toBe(0);
    expect(chargedAmountUsd({})).toBeNull();
  });
});
