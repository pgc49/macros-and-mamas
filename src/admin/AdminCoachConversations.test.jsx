// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  loadClientCoachThread: vi.fn(),
}));

vi.mock("../db/db", () => ({ db }));

import { AdminCoachConversations } from "./AdminCoachConversations.jsx";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
});

const client = { id: "mama-1", name: "QA Tester" };

describe("AdminCoachConversations", () => {
  it("renders newest first with plates in plain form and flags pinned", async () => {
    db.loadClientCoachThread.mockResolvedValue([
      {
        id: "c3",
        role: "coach",
        body: "",
        kind: "deflect",
        payload: { deflect: "again" },
        seq: 6,
        createdAt: "2026-10-08T18:00:00.000Z",
        localDate: "2026-10-08",
      },
      {
        id: "m3",
        role: "mama",
        body: "should I skip dinner",
        kind: "text",
        payload: null,
        seq: 5,
        createdAt: "2026-10-08T17:59:00.000Z",
        localDate: "2026-10-08",
      },
      {
        id: "c1",
        role: "coach",
        body: "Tonight.",
        kind: "cards",
        payload: {
          cards: [{ name: "Chicken bowl", cal: 430, p: 45, c: 30, f: 12, reason: "Gets protein into range." }],
        },
        seq: 2,
        createdAt: "2026-10-08T16:00:01.000Z",
        localDate: "2026-10-08",
        hiddenAt: "2026-10-08T19:00:00.000Z",
      },
      {
        id: "m1",
        role: "mama",
        body: "what should I eat",
        kind: "text",
        payload: null,
        seq: 1,
        createdAt: "2026-10-08T16:00:00.000Z",
        localDate: "2026-10-08",
      },
    ]);

    render(<AdminCoachConversations client={client} />);

    expect(await screen.findByText("Coach conversations")).toBeTruthy();
    expect(db.loadClientCoachThread).toHaveBeenCalledWith("mama-1");
    expect(screen.getByText("Chicken bowl")).toBeTruthy();
    expect(screen.getByText("430 cal · P45 · C30 · F12")).toBeTruthy();
    expect(screen.getByText("Gets protein into range.")).toBeTruthy();
    expect(screen.getByText(/removed by her/)).toBeTruthy();
    expect(screen.getByText("Stuck")).toBeTruthy();
    expect(screen.getByText(/She asked: should I skip dinner/)).toBeTruthy();

    const thread = document.querySelector("[data-admin-coach-conversations]");
    const html = thread.textContent;
    expect(html.indexOf("should I skip dinner")).toBeLessThan(html.indexOf("what should I eat"));
  });

  it("says when she has no Coach chats", async () => {
    db.loadClientCoachThread.mockResolvedValue([]);
    render(<AdminCoachConversations client={client} />);
    expect(await screen.findByText("No Coach chats yet.")).toBeTruthy();
  });
});
