import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-id" })),
  update: vi.fn(),
  load: vi.fn(),
}));

vi.mock("../_shared/messagingRuntime.js", () => ({
  requireAdmin: mocks.requireAdmin,
  updateMessagingRuntime: mocks.update,
  loadMessagingRuntime: mocks.load,
}));

import { onRequestPost } from "./admin-messaging-runtime.js";

beforeEach(() => {
  vi.clearAllMocks();
});

function request(body) {
  return new Request("https://example.com/api/admin-messaging-runtime", {
    method: "POST",
    headers: {
      authorization: "Bearer token",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("admin messaging runtime API", () => {
  it("sends a versioned partial update", async () => {
    mocks.update.mockResolvedValue({
      mode: "read_only",
      attachments_enabled: true,
      notifications_enabled: true,
      reason: "Maintenance",
      updated_at: "2026-08-11T01:00:00Z",
    });
    const response = await onRequestPost({
      request: request({
        mode: "read_only",
        reason: "Maintenance",
        expectedUpdatedAt: "2026-08-11T00:00:00Z",
      }),
      env: {},
    });
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(
      {},
      { mode: "read_only", reason: "Maintenance" },
      "admin-id",
      "2026-08-11T00:00:00Z",
      expect.any(String),
    );
  });

  it("returns conflict instead of overwriting a newer control change", async () => {
    const conflict = new Error("conflict");
    conflict.code = "CONFLICT";
    mocks.update.mockRejectedValue(conflict);
    const response = await onRequestPost({
      request: request({
        attachmentsEnabled: false,
        expectedUpdatedAt: "2026-08-11T00:00:00Z",
      }),
      env: {},
    });
    expect(response.status).toBe(409);
  });
});

