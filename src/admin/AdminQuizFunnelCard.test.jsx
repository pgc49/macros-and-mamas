// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadQuizFunnelPulse = vi.fn();

vi.mock("./quizFunnel", () => ({
  loadQuizFunnelPulse: (...args) => loadQuizFunnelPulse(...args),
}));

vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: "test-token" } } }),
    },
  },
}));

import { AdminQuizFunnelCard } from "./AdminQuizFunnelCard.jsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  loadQuizFunnelPulse.mockReset();
  loadQuizFunnelPulse.mockResolvedValue({
    startIso: "2026-08-19T07:00:00.000Z",
    quizLeads: 7,
    unpaidSignups: 3,
    paid: 1,
    rangesSubmitted: 70,
    unpaidLeads: 52,
    paidFromQuiz: 18,
  });
});

describe("AdminQuizFunnelCard", () => {
  it("shows all-time unpaid range leads plus today's pulse", async () => {
    render(<AdminQuizFunnelCard />);

    expect(screen.getByText(/True leads submitted ranges and have not paid/)).toBeTruthy();
    expect(screen.getByText(/Bounces show in Sentry as quiz_signup_bounce/)).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText("52")).toBeTruthy();
    });
    expect(screen.getByText("Unpaid (true leads)")).toBeTruthy();
    expect(screen.getByText("Ranges in")).toBeTruthy();
    expect(screen.getByText("70")).toBeTruthy();
    expect(screen.getByText("Paid from quiz")).toBeTruthy();
    expect(screen.getByText("18")).toBeTruthy();
    expect(screen.getByText("Today")).toBeTruthy();
    expect(screen.getByText("Quiz leads")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText("Unpaid signups")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(loadQuizFunnelPulse).toHaveBeenCalledTimes(1);
  });

  it("opens the unpaid leads list from the true-lead count", async () => {
    const onOpenLeads = vi.fn();
    render(<AdminQuizFunnelCard onOpenLeads={onOpenLeads} />);
    await waitFor(() => {
      expect(screen.getByText("52")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: /Unpaid \(true leads\): 52/ }));
    expect(onOpenLeads).toHaveBeenCalledWith("unpaid");
  });

  it("previews the one-more note without a money-back promise", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        dryRun: true,
        candidates: 40,
        preview: "Hi, Mama!\n\nOne last time: you matter.",
      }),
    })));
    render(<AdminQuizFunnelCard />);
    await waitFor(() => {
      expect(screen.getByText("52")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "Email unpaid leads" }));
    await waitFor(() => {
      expect(screen.getByText(/40 will get this/)).toBeTruthy();
    });
    expect(screen.getByText(/you matter/i)).toBeTruthy();
    expect(screen.getByText(/Each email says Hi, her first name/)).toBeTruthy();
    expect(screen.getByText(/Do not promise a week-back refund/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send to 40" })).toBeTruthy();
  });
});
