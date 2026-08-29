// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    loadVoiceDropAdminStatus: vi.fn(),
  },
}));

vi.mock("../db/db", () => ({
  db: dbMock,
}));

vi.mock("../lib/voiceDropDraft", () => ({
  clearVoiceDropDraft: vi.fn(),
  loadVoiceDropDraft: vi.fn(async () => null),
  saveVoiceDropDraft: vi.fn(),
}));

import { AdminVoiceDropCard } from "./AdminVoiceDropCard.jsx";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  dbMock.loadVoiceDropAdminStatus.mockReset();
  dbMock.loadVoiceDropAdminStatus.mockResolvedValue({
    live: [
      {
        id: "founding",
        caption: "Founding Monday note",
        audience: "active",
        cohort_label: "2026-07",
        status: "published",
        published_at: "2026-08-31T15:00:00.000Z",
        expires_at: "2026-09-07T15:00:00.000Z",
        audioUrl: null,
      },
      {
        id: "c2",
        caption: "Cohort 2 welcome",
        audience: "active",
        cohort_label: "2026-08",
        status: "published",
        published_at: "2026-08-31T15:05:00.000Z",
        expires_at: "2026-09-07T15:05:00.000Z",
        audioUrl: null,
      },
    ],
    latest: { id: "c2", caption: "Cohort 2 welcome" },
  });
});

describe("AdminVoiceDropCard", () => {
  it("shows Founding and Cohort 2 live drops at the same time", async () => {
    const view = render(<AdminVoiceDropCard />);
    expect(view.getByText(/each have their own live drop/)).toBeTruthy();
    await waitFor(() => {
      expect(view.getByText("Founding Monday note")).toBeTruthy();
      expect(view.getByText("Cohort 2 welcome")).toBeTruthy();
      expect(view.getAllByText(/Founding · active/).length).toBeGreaterThan(0);
      expect(view.getAllByText(/Cohort 2 · active/).length).toBeGreaterThan(0);
    });
  });
});
