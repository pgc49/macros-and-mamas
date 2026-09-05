import { describe, expect, it, vi } from "vitest";
import {
  SIGNED_URL_REFRESH_MARGIN_MS,
  SIGNED_URL_TTL_SECONDS,
  createSignedUrlCache,
} from "./signedUrlCache";

function signer(prefix = "signed") {
  let call = 0;
  const fn = vi.fn(async (_bucket, paths) => {
    call += 1;
    return paths.map((path) => ({ path, signedUrl: `${prefix}:${path}:${call}` }));
  });
  return fn;
}

describe("createSignedUrlCache", () => {
  it("signs every requested path in one batch", async () => {
    const cache = createSignedUrlCache();
    const sign = signer();

    const urls = await cache.resolve("attach", ["a.jpg", "b.pdf", "c.png"], sign);

    expect(sign).toHaveBeenCalledTimes(1);
    expect(sign.mock.calls[0][1]).toEqual(["a.jpg", "b.pdf", "c.png"]);
    expect(sign.mock.calls[0][2]).toBe(SIGNED_URL_TTL_SECONDS);
    expect(urls.get("a.jpg")).toBe("signed:a.jpg:1");
    expect(urls.size).toBe(3);
  });

  it("returns a byte-identical URL on a later refresh", async () => {
    const cache = createSignedUrlCache();
    const sign = signer();

    const first = await cache.resolve("attach", ["a.jpg"], sign);
    const second = await cache.resolve("attach", ["a.jpg"], sign);

    // A changed URL would remount the <img>, collapse the bubble, and jump the
    // list — the whole reason this cache exists.
    expect(second.get("a.jpg")).toBe(first.get("a.jpg"));
    expect(sign).toHaveBeenCalledTimes(1);
  });

  it("only signs the paths it has not seen before", async () => {
    const cache = createSignedUrlCache();
    const sign = signer();

    await cache.resolve("attach", ["a.jpg", "b.pdf"], sign);
    const urls = await cache.resolve("attach", ["b.pdf", "c.png"], sign);

    expect(sign).toHaveBeenCalledTimes(2);
    expect(sign.mock.calls[1][1]).toEqual(["c.png"]);
    expect(urls.get("b.pdf")).toBe("signed:b.pdf:1");
    expect(urls.get("c.png")).toBe("signed:c.png:2");
  });

  it("de-duplicates repeated paths in one request", async () => {
    const cache = createSignedUrlCache();
    const sign = signer();

    await cache.resolve("attach", ["a.jpg", "a.jpg", null, "", "a.jpg"], sign);

    expect(sign.mock.calls[0][1]).toEqual(["a.jpg"]);
  });

  it("shares one request between parallel loads of the same attachment", async () => {
    const cache = createSignedUrlCache();
    const sign = signer();

    const [left, right] = await Promise.all([
      cache.resolve("attach", ["a.jpg"], sign),
      cache.resolve("attach", ["a.jpg"], sign),
    ]);

    expect(sign).toHaveBeenCalledTimes(1);
    expect(left.get("a.jpg")).toBe(right.get("a.jpg"));
  });

  it("keeps buckets separate", async () => {
    const cache = createSignedUrlCache();
    const sign = signer();

    await cache.resolve("dm", ["a.jpg"], sign);
    await cache.resolve("channel", ["a.jpg"], sign);

    expect(sign).toHaveBeenCalledTimes(2);
    expect(sign.mock.calls.map((c) => c[0])).toEqual(["dm", "channel"]);
  });

  it("re-signs once the URL is inside the refresh margin", async () => {
    let clock = 0;
    const cache = createSignedUrlCache({ now: () => clock });
    const sign = signer();

    const first = await cache.resolve("attach", ["a.jpg"], sign);
    clock += SIGNED_URL_TTL_SECONDS * 1000 - SIGNED_URL_REFRESH_MARGIN_MS + 1;
    const second = await cache.resolve("attach", ["a.jpg"], sign);

    expect(sign).toHaveBeenCalledTimes(2);
    expect(second.get("a.jpg")).not.toBe(first.get("a.jpg"));
  });

  it("holds a URL that is still comfortably inside its TTL", async () => {
    let clock = 0;
    const cache = createSignedUrlCache({ now: () => clock });
    const sign = signer();

    await cache.resolve("attach", ["a.jpg"], sign);
    clock += 60_000;
    await cache.resolve("attach", ["a.jpg"], sign);

    expect(sign).toHaveBeenCalledTimes(1);
  });

  it("omits a path the signer could not sign instead of caching a null", async () => {
    const cache = createSignedUrlCache();
    const sign = vi.fn(async (_bucket, paths) => paths.map((path) => (
      path === "missing.jpg" ? { path, error: "not found" } : { path, signedUrl: `ok:${path}` }
    )));

    const urls = await cache.resolve("attach", ["a.jpg", "missing.jpg"], sign);

    expect(urls.get("a.jpg")).toBe("ok:a.jpg");
    expect(urls.has("missing.jpg")).toBe(false);

    await cache.resolve("attach", ["missing.jpg"], sign);
    expect(sign).toHaveBeenCalledTimes(2);
  });

  it("resolves empty instead of throwing when the whole batch fails", async () => {
    const cache = createSignedUrlCache();
    const sign = vi.fn(async () => {
      throw new Error("storage down");
    });

    await expect(cache.resolve("attach", ["a.jpg"], sign)).resolves.toEqual(new Map());
  });

  it("retries after a failed batch rather than caching the failure", async () => {
    const cache = createSignedUrlCache();
    const sign = vi.fn()
      .mockRejectedValueOnce(new Error("storage down"))
      .mockResolvedValueOnce([{ path: "a.jpg", signedUrl: "ok:a.jpg" }]);

    await cache.resolve("attach", ["a.jpg"], sign);
    const urls = await cache.resolve("attach", ["a.jpg"], sign);

    expect(urls.get("a.jpg")).toBe("ok:a.jpg");
  });

  it("short-circuits an empty or bucketless request without signing", async () => {
    const cache = createSignedUrlCache();
    const sign = signer();

    expect(await cache.resolve("attach", [], sign)).toEqual(new Map());
    expect(await cache.resolve("", ["a.jpg"], sign)).toEqual(new Map());
    expect(sign).not.toHaveBeenCalled();
  });

  it("exposes cached URLs through peek and drops them on clear", async () => {
    const cache = createSignedUrlCache();
    const sign = signer();

    await cache.resolve("attach", ["a.jpg"], sign);
    expect(cache.peek("attach", "a.jpg")).toBe("signed:a.jpg:1");
    expect(cache.peek("attach", "b.jpg")).toBeNull();

    cache.clear();
    expect(cache.peek("attach", "a.jpg")).toBeNull();
  });
});
