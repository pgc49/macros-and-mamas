import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearVoiceDropCache,
  loadCurrentVoiceDropCached,
  peekVoiceDropCache,
  seedVoiceDropCache,
} from "./voiceDropCache";

afterEach(() => {
  clearVoiceDropCache();
});

describe("voiceDropCache", () => {
  it("returns a seeded row without calling load", async () => {
    const drop = { id: "vd-1", audioUrl: "https://example.test/a.m4a" };
    seedVoiceDropCache(drop);
    const load = vi.fn(async () => ({ id: "other" }));
    await expect(loadCurrentVoiceDropCached(load)).resolves.toEqual(drop);
    expect(load).not.toHaveBeenCalled();
    expect(peekVoiceDropCache()).toEqual(drop);
  });

  it("dedupes in-flight loads and caches a miss as null", async () => {
    let resolveLoad;
    const load = vi.fn(() => new Promise((resolve) => {
      resolveLoad = resolve;
    }));
    const first = loadCurrentVoiceDropCached(load);
    const second = loadCurrentVoiceDropCached(load);
    expect(load).toHaveBeenCalledTimes(1);
    resolveLoad(null);
    await expect(first).resolves.toBeNull();
    await expect(second).resolves.toBeNull();
    expect(peekVoiceDropCache()).toBeNull();
  });

  it("does not cache a failed load", async () => {
    const load = vi.fn(async () => {
      throw new Error("offline");
    });
    await expect(loadCurrentVoiceDropCached(load)).rejects.toThrow("offline");
    expect(peekVoiceDropCache()).toBeUndefined();

    const retry = vi.fn(async () => ({ id: "vd-2" }));
    await expect(loadCurrentVoiceDropCached(retry)).resolves.toEqual({ id: "vd-2" });
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
