// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "./clipboard";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("copyText", () => {
  it("uses the clipboard API when it resolves", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    document.execCommand = vi.fn(() => false);

    await copyText("PAT25");
    expect(writeText).toHaveBeenCalledWith("PAT25");
  });

  it("still copies when the clipboard API never settles", async () => {
    const writeText = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    document.execCommand = vi.fn(() => true);

    await copyText("PAT25");
    expect(writeText).toHaveBeenCalledWith("PAT25");
    expect(document.execCommand).toHaveBeenCalledWith("copy");
  });

  it("rejects when neither path can copy", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    document.execCommand = vi.fn(() => false);

    const pending = copyText("PAT25");
    const rejected = pending.then(
      () => false,
      () => true,
    );
    await vi.advanceTimersByTimeAsync(700);
    expect(await rejected).toBe(true);
  });
});
