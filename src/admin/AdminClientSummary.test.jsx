// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  loadLatestClientSummary: vi.fn(),
  saveClientSummary: vi.fn(),
}));

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock("../db/db", () => ({ db }));
vi.mock("../lib/supabase", () => ({
  supabase: { auth: { getSession: auth.getSession } },
}));

import { AdminClientSummary } from "./AdminClientSummary.jsx";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  db.loadLatestClientSummary.mockResolvedValue(null);
  db.saveClientSummary.mockResolvedValue({
    summary: "Fresh note.",
    suggested_touch: "Say hi.",
    created_at: "2026-09-04T19:00:00.000Z",
  });
  auth.getSession.mockResolvedValue({ data: { session: { access_token: "admin-token" } } });
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: async () => ({ summary: "Fresh note.", suggested_touch: "Say hi.", model: "test" }),
  });
});

const client = {
  id: "538e5a4d-4203-4ff7-b434-f36b185998bb",
  name: "Kristen",
  status: "pending",
  cohort_label: "2026-08",
  macros: null,
};

describe("AdminClientSummary", () => {
  it("loads a cached summary and does not call the model on open", async () => {
    db.loadLatestClientSummary.mockResolvedValue({
      summary: "Quiet so far.",
      suggested_touch: "Check in after intake.",
      created_at: "2026-09-03T12:00:00.000Z",
    });
    render(<AdminClientSummary client={client} progress={{}} progressLoading={false} />);
    expect(await screen.findByText("Quiet so far.")).toBeTruthy();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("waits for Refresh instead of auto-writing a new summary", async () => {
    render(<AdminClientSummary client={client} progress={{}} progressLoading={false} />);
    expect(await screen.findByText(/No summary yet/)).toBeTruthy();
    expect(globalThis.fetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Write summary" }));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Fresh note.")).toBeTruthy();
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.payload.week).toBeNull();
    expect(body.payload.started).toBe(false);
  });
});
