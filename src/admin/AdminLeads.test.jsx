// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadQuizLeads = vi.fn();

vi.mock("./quizLeads", async () => {
  const actual = await vi.importActual("./quizLeads");
  return {
    ...actual,
    loadQuizLeads: (...args) => loadQuizLeads(...args),
  };
});

import { AdminLeads } from "./AdminLeads.jsx";

const MEGAN = "11111111-1111-4111-8111-111111111111";

const rows = [
  {
    id: "lead-meta",
    email: "quiz@example.com",
    first_name: "Quiz",
    last_name: "Only",
    created_at: "2026-08-19T18:30:00.000Z",
    fbc: "fb.1.1.abc",
    fbp: "fb.1.1.xyz",
    utm_source: "meta",
    referred_by: null,
    flags: ["vegan"],
    segment: "waitlist_plantbased",
    protein_low_g: 90,
    protein_high_g: 110,
    carbs_low_g: 150,
    carbs_high_g: 190,
    fat_low_g: 45,
    fat_high_g: 60,
    calories_low: 1700,
    calories_high: 1900,
    profileId: null,
    funnelStatus: "quiz_only",
    sourceKind: "meta",
    isMeta: true,
  },
  {
    id: "lead-paid",
    email: "megan@example.com",
    first_name: "Megan",
    last_name: "Wells",
    created_at: "2026-08-18T16:00:00.000Z",
    fbp: null,
    fbc: null,
    utm_source: null,
    referred_by: "Sarah",
    flags: [],
    segment: "main",
    protein_low_g: 110,
    protein_high_g: 130,
    carbs_low_g: 140,
    carbs_high_g: 180,
    fat_low_g: 50,
    fat_high_g: 65,
    calories_low: 1800,
    calories_high: 2000,
    profileId: MEGAN,
    funnelStatus: "paid",
    sourceKind: "referral",
    isMeta: false,
  },
];

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  loadQuizLeads.mockReset();
  loadQuizLeads.mockResolvedValue(rows);
});

describe("AdminLeads", () => {
  it("lists quiz completes newest-first with source and funnel status", async () => {
    render(<AdminLeads />);

    expect(screen.getByText(/Quiz completes — the Meta Lead we fire/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "All" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Meta" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "No account" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Signed up unpaid" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Paid" })).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText("Quiz Only")).toBeTruthy();
    });
    expect(screen.getByText("quiz@example.com")).toBeTruthy();
    expect(screen.getByText(/Meta · Quiz only/)).toBeTruthy();
    expect(screen.getByText("Plant-based · Vegan")).toBeTruthy();
    expect(screen.getByText("90–110P · 150–190C · 45–60F · 1700–1900 cal")).toBeTruthy();
    expect(screen.getByText("Megan Wells")).toBeTruthy();
    expect(screen.getByText(/Referral · Sarah · Paid/)).toBeTruthy();
    expect(screen.getByText("2 quiz completes")).toBeTruthy();
    expect(screen.queryByText(/Ads Manager/i)).toBeTruthy();
    expect(screen.queryByText(/Sentry/i)).toBeNull();
  });

  it("filters to Meta leads", async () => {
    render(<AdminLeads />);
    await waitFor(() => {
      expect(screen.getByText("Megan Wells")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Meta" }));
    expect(screen.getByRole("button", { name: "Meta" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Quiz Only")).toBeTruthy();
    expect(screen.queryByText("Megan Wells")).toBeNull();
    expect(screen.getByText("1 of 2")).toBeTruthy();
  });

  it("opens a mama profile when she has an account", async () => {
    const onOpenMama = vi.fn();
    render(<AdminLeads onOpenMama={onOpenMama} />);
    await waitFor(() => {
      expect(screen.getByText("Megan Wells")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("Megan Wells"));
    expect(onOpenMama).toHaveBeenCalledWith(MEGAN);

    onOpenMama.mockClear();
    fireEvent.click(screen.getByText("Quiz Only"));
    expect(onOpenMama).not.toHaveBeenCalled();
  });
});
