import { afterEach, describe, expect, it, vi } from "vitest";
import { clearRemoteAppVersionCache, fetchRemoteAppVersion } from "./appUpdate";

afterEach(() => {
  clearRemoteAppVersionCache();
  vi.unstubAllGlobals();
});

describe("fetchRemoteAppVersion", () => {
  it("reuses a successful fetch for a short window", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ buildId: "abc123", notes: null }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const first = await fetchRemoteAppVersion();
    const second = await fetchRemoteAppVersion();
    expect(first).toEqual({ buildId: "abc123", notes: null });
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed fetch", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ buildId: "def456" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchRemoteAppVersion()).resolves.toBeNull();
    await expect(fetchRemoteAppVersion()).resolves.toEqual({
      buildId: "def456",
      notes: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
