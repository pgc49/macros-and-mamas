// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadQuizFunnelPulse = vi.fn();

vi.mock("./quizFunnel", () => ({
  loadQuizFunnelPulse: (...args) => loadQuizFunnelPulse(...args),
}));

import { AdminQuizFunnelCard } from "./AdminQuizFunnelCard.jsx";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  loadQuizFunnelPulse.mockReset();
  loadQuizFunnelPulse.mockResolvedValue({
    startIso: "2026-08-19T07:00:00.000Z",
    quizLeads: 7,
    unpaidSignups: 3,
    paid: 1,
  });
});

describe("AdminQuizFunnelCard", () => {
  it("shows today's quiz / unpaid / paid counts and points bounces at Sentry", async () => {
    render(<AdminQuizFunnelCard />);

    expect(screen.getByText(/Bounces show in Sentry as quiz_signup_bounce/)).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText("7")).toBeTruthy();
    });
    expect(screen.getByText("Quiz leads")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("Unpaid signups")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("Paid")).toBeTruthy();
    expect(loadQuizFunnelPulse).toHaveBeenCalledTimes(1);
  });

  it("opens the Leads tab from today's Quiz leads count", async () => {
    const onOpenLeads = vi.fn();
    render(<AdminQuizFunnelCard onOpenLeads={onOpenLeads} />);
    await waitFor(() => {
      expect(screen.getByText("7")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: /Quiz leads: 7/ }));
    expect(onOpenLeads).toHaveBeenCalledTimes(1);
  });
});
