import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadMessagingHealth,
  loadMessagingRuntime,
  updateMessagingRuntime,
} from "./messagingRuntime.js";

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  SUPABASE_ANON_KEY: "anon",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("messaging runtime operations", () => {
  it("loads and updates the singleton safely", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        mode: "read_only",
        attachments_enabled: false,
        notifications_enabled: true,
        reason: "Maintenance",
        updated_at: "2026-08-11T00:00:00Z",
      }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        mode: "normal",
        attachments_enabled: true,
        notifications_enabled: true,
        updated_at: "2026-08-11T01:00:00Z",
      }]), { status: 200 }));

    const loaded = await loadMessagingRuntime(env);
    expect(loaded.mode).toBe("read_only");

    const updated = await updateMessagingRuntime(env, {
      mode: "normal",
      attachments_enabled: true,
      notifications_enabled: true,
      reason: "",
    }, "admin-id", "2026-08-11T00:00:00Z", "request-id");
    expect(updated.mode).toBe("normal");
    const patch = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(patch.p_actor_id).toBe("admin-id");
    expect(patch.p_expected_updated_at).toBe("2026-08-11T00:00:00Z");
  });

  it("reports dead and aging outbox jobs without message content", async () => {
    const old = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        mode: "normal",
        attachments_enabled: true,
        notifications_enabled: true,
        reason: "",
      }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        pending: 0,
        retry: 1,
        processing: 0,
        dead: 1,
        expired: 0,
        oldest_open_at: old,
        stale_processing: 0,
      }]), { status: 200 }));

    const health = await loadMessagingHealth(env);
    expect(health.outbox.retry).toBe(1);
    expect(health.outbox.dead).toBe(1);
    expect(health.outbox.oldestAgeSeconds).toBeGreaterThanOrEqual(14 * 60);
    expect(JSON.stringify(health)).not.toContain("body");
  });
});

