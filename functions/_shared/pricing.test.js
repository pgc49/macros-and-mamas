import { afterEach, describe, expect, it, vi } from "vitest";
import {
  stripeNicknameForTier,
  syncStripePriceNickname,
} from "./pricing.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("stripeNicknameForTier", () => {
  it("uses Early rate for the $249 quiz price", () => {
    expect(stripeNicknameForTier("waitlist")).toBe("Early rate");
  });
});

describe("syncStripePriceNickname", () => {
  it("no-ops without credentials", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(syncStripePriceNickname("", "price_x", "Early rate")).resolves.toEqual({
      ok: false,
      skipped: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips the update when Stripe already has the nickname", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ nickname: "Early rate" }),
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      syncStripePriceNickname("sk_test", "price_waitlist", "Early rate"),
    ).resolves.toEqual({ ok: true, unchanged: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("/v1/prices/price_waitlist");
    expect(fetchMock.mock.calls[0][1].method).toBeUndefined();
  });

  it("renames Priority Waitlist Special to Early rate", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ nickname: "Priority Waitlist Special" }),
        text: async () => "",
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ nickname: "Early rate" }),
        text: async () => "",
      });
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      syncStripePriceNickname("sk_test", "price_waitlist", "Early rate"),
    ).resolves.toEqual({ ok: true, updated: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, patch] = fetchMock.mock.calls[1];
    expect(patch.method).toBe("POST");
    expect(String(patch.body)).toBe("nickname=Early+rate");
  });
});
