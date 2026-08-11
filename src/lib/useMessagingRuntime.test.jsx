// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  getSession: vi.fn(async () => ({
    data: { session: { access_token: "token" } },
  })),
}));

vi.mock("../db/db", () => ({
  db: { loadMessagingRuntime: mocks.load },
}));

vi.mock("./supabase", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));

import { useMessagingRuntime } from "./useMessagingRuntime";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.load.mockResolvedValue({
    mode: "normal",
    attachmentsEnabled: true,
    notificationsEnabled: true,
    reason: "",
    updatedAt: "2026-08-11T00:00:00Z",
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useMessagingRuntime sequencing", () => {
  it("does not start a stale refresh while an admin mutation is in flight", async () => {
    let resolveUpdate;
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise((resolve) => {
      resolveUpdate = resolve;
    }));
    const { result } = renderHook(() => useMessagingRuntime());
    await waitFor(() => expect(result.current.runtimeLoaded).toBe(true));
    expect(mocks.load).toHaveBeenCalledTimes(1);

    let updatePromise;
    act(() => {
      updatePromise = result.current.updateRuntime({ mode: "read_only" });
    });

    let refreshResult;
    await act(async () => {
      refreshResult = await result.current.refreshRuntime();
    });
    expect(refreshResult).toBeNull();
    expect(mocks.load).toHaveBeenCalledTimes(1);

    resolveUpdate(new Response(JSON.stringify({
      runtime: {
        mode: "read_only",
        attachments_enabled: true,
        notifications_enabled: true,
        reason: "Maintenance",
        updated_at: "2026-08-11T00:01:00Z",
      },
    }), { status: 200 }));

    await act(async () => {
      await updatePromise;
    });
    expect(result.current.runtime.mode).toBe("read_only");
    expect(result.current.runtime.updatedAt).toBe("2026-08-11T00:01:00Z");
  });
});

