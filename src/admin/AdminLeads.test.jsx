// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadQuizLeads = vi.fn();
const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    loadEmailEventsByEmail: vi.fn(),
    isEmailUnsubscribed: vi.fn(),
  },
}));

vi.mock("./quizLeads", async () => {
  const actual = await vi.importActual("./quizLeads");
  return {
    ...actual,
    loadQuizLeads: (...args) => loadQuizLeads(...args),
  };
});

vi.mock("../db/db", () => ({
  db: dbMock,
}));

import { AdminLeads } from "./AdminLeads.jsx";

const MEGAN = "11111111-1111-4111-8111-111111111111";

const rows = [
  {
    id: "lead-ellie",
    email: "ellie@example.com",
    first_name: "Ellie",
    last_name: "Rose",
    created_at: "2026-08-19T18:30:00.000Z",
    fbc: "fb.1.1.abc",
    fbp: "fb.1.1.xyz",
    utm_source: "meta",
    utm_medium: "cpc",
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
    sourceKind: "meta_ad",
    isMeta: true,
    isMetaAd: true,
    isMetaClick: false,
    isReferral: false,
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
    isReferral: true,
  },
  {
    id: "lead-alex",
    email: "alex@example.com",
    first_name: "Alex",
    last_name: "Harrer",
    created_at: "2026-08-17T16:00:00.000Z",
    fbp: "fb.1.1.xyz",
    fbc: "fb.1.1.igclick",
    utm_source: null,
    referred_by: null,
    referralCode: "KRISTEN25",
    referralAdvocateFirstName: "Kristen",
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
    profileId: "alex-id",
    funnelStatus: "paid",
    sourceKind: "meta_click_referral",
    isMeta: false,
    isMetaAd: false,
    isMetaClick: true,
    isReferral: true,
  },
];

const ellieEvents = [
  {
    id: "evt-ranges",
    profile_id: null,
    email_type: "quiz_ranges",
    to_email: "ellie@example.com",
    subject: "Your ranges",
    status: "sent",
    created_at: "2026-08-19T18:31:00.000Z",
  },
  {
    id: "evt-drip",
    profile_id: null,
    email_type: "quiz_drip_2d",
    to_email: "ELLIE@example.com",
    subject: "the numbers are the easy part",
    status: "failed",
    created_at: "2026-08-21T12:00:00.000Z",
  },
];

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  loadQuizLeads.mockReset();
  loadQuizLeads.mockResolvedValue(rows);
  dbMock.loadEmailEventsByEmail.mockReset();
  dbMock.loadEmailEventsByEmail.mockResolvedValue([]);
  dbMock.isEmailUnsubscribed.mockReset();
  dbMock.isEmailUnsubscribed.mockResolvedValue(false);
});

describe("AdminLeads", () => {
  it("lists quiz completes newest-first with source and funnel status", async () => {
    render(<AdminLeads />);

    expect(screen.getByText(/Quiz completes — the Meta Lead we fire/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "All" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Ad" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Referral" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "No account" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Signed up unpaid" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Paid" })).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText("Ellie Rose")).toBeTruthy();
    });
    expect(screen.getByText("ellie@example.com")).toBeTruthy();
    expect(screen.getByText(/Meta ad · Quiz only/)).toBeTruthy();
    expect(screen.getByText("Plant-based · Vegan")).toBeTruthy();
    expect(screen.getByText("90–110P · 150–190C · 45–60F · 1700–1900 cal")).toBeTruthy();
    expect(screen.getByText("Megan Wells")).toBeTruthy();
    expect(screen.getByText(/Referral · Sarah · Paid/)).toBeTruthy();
    expect(screen.getByText("Alex Harrer")).toBeTruthy();
    expect(screen.getByText(/Meta link · Kristen · Paid/)).toBeTruthy();
    expect(screen.getByText("3 quiz completes")).toBeTruthy();
    expect(screen.queryByText(/Ads Manager/i)).toBeTruthy();
    expect(screen.queryByText(/Sentry/i)).toBeNull();
  });

  it("filters Ad to campaign UTMs only; Referral keeps promo and quiz referred_by", async () => {
    render(<AdminLeads />);
    await waitFor(() => {
      expect(screen.getByText("Megan Wells")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Ad" }));
    expect(screen.getByRole("button", { name: "Ad" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Ellie Rose")).toBeTruthy();
    expect(screen.queryByText("Alex Harrer")).toBeNull();
    expect(screen.queryByText("Megan Wells")).toBeNull();
    expect(screen.getByText("1 of 3")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Referral" }));
    expect(screen.getByRole("button", { name: "Referral" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Megan Wells")).toBeTruthy();
    expect(screen.getByText("Alex Harrer")).toBeTruthy();
    expect(screen.queryByText("Ellie Rose")).toBeNull();
    expect(screen.getByText("2 of 3")).toBeTruthy();
  });

  it("opens lead detail for quiz-only and account leads; client card is secondary", async () => {
    const onOpenMama = vi.fn();
    render(<AdminLeads onOpenMama={onOpenMama} />);
    await waitFor(() => {
      expect(screen.getByText("Megan Wells")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Megan Wells"));
    expect(onOpenMama).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText("megan@example.com")).toBeTruthy();
    });
    expect(screen.getByRole("link", { name: "Email" }).getAttribute("href")).toBe(
      "mailto:megan@example.com?subject=Macros%20and%20Mamas",
    );
    fireEvent.click(screen.getByRole("button", { name: "Open client card" }));
    expect(onOpenMama).toHaveBeenCalledWith(MEGAN);

    fireEvent.click(screen.getByRole("button", { name: "← Quiz leads" }));
    onOpenMama.mockClear();
    fireEvent.click(screen.getByText("Ellie Rose"));
    await waitFor(() => {
      expect(screen.getByText("ellie@example.com")).toBeTruthy();
    });
    expect(onOpenMama).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Open client card" })).toBeNull();
  });

  it("shows send history keyed by email for a quiz-only lead", async () => {
    dbMock.loadEmailEventsByEmail.mockResolvedValue(ellieEvents);
    render(<AdminLeads />);
    await waitFor(() => {
      expect(screen.getByText("Ellie Rose")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Ellie Rose"));
    await waitFor(() => {
      expect(screen.getByText("Quiz ranges")).toBeTruthy();
    });
    expect(dbMock.loadEmailEventsByEmail).toHaveBeenCalledWith("ellie@example.com");
    expect(screen.getByText("Your ranges")).toBeTruthy();
    expect(screen.getByText("Quiz drip (+2d)")).toBeTruthy();
    expect(screen.getByText("the numbers are the easy part")).toBeTruthy();
    expect(screen.getByText(/Failed/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Email" }).getAttribute("href")).toBe(
      "mailto:ellie@example.com?subject=Macros%20and%20Mamas",
    );
    expect(screen.queryByText("No emails sent yet.")).toBeNull();
  });

  it("copies the lead email and confirms", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<AdminLeads />);
    await waitFor(() => {
      expect(screen.getByText("Ellie Rose")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("Ellie Rose"));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Copy ellie@example.com" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Copy ellie@example.com" }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("ellie@example.com");
      expect(screen.getByRole("button", { name: "Email copied" })).toBeTruthy();
      expect(screen.getByText("Copied")).toBeTruthy();
    });
  });

  it("does not open detail when a lead has no email", async () => {
    loadQuizLeads.mockResolvedValue([
      {
        ...rows[0],
        email: "",
        first_name: "No",
        last_name: "Address",
      },
    ]);
    render(<AdminLeads />);
    await waitFor(() => {
      expect(screen.getByText("No Address")).toBeTruthy();
    });
    expect(screen.getByText("No Address").closest("button")?.disabled).toBe(true);
    expect(dbMock.loadEmailEventsByEmail).not.toHaveBeenCalled();
  });

  it("shows the next quiz drip and expected time after ranges for a no-account lead", async () => {
    const now = Date.parse("2026-08-21T18:00:00.000Z");
    const rangesAt = Date.parse("2026-08-20T12:00:00.000Z");
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now);
    loadQuizLeads.mockResolvedValue([
      {
        ...rows[0],
        email: "dolly@example.com",
        first_name: "Dolly",
        last_name: "Chammas",
        segment: "main",
        flags: [],
        profileId: null,
        funnelStatus: "quiz_only",
        created_at: new Date(rangesAt).toISOString(),
      },
    ]);
    dbMock.loadEmailEventsByEmail.mockResolvedValue([
      {
        id: "evt-ranges",
        profile_id: null,
        email_type: "quiz_ranges",
        to_email: "dolly@example.com",
        subject: "Your ranges",
        status: "sent",
        created_at: new Date(rangesAt).toISOString(),
      },
    ]);

    render(<AdminLeads />);
    await waitFor(() => {
      expect(screen.getByText("Dolly Chammas")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("Dolly Chammas"));
    await waitFor(() => {
      expect(screen.getByText(/Next: Quiz drip \(\+2d\) · /)).toBeTruthy();
    });
    expect(screen.getByText(/Next: Quiz drip \(\+2d\) · /).textContent).not.toMatch(/Due now/);
    expect(screen.getByText("Still scheduled")).toBeTruthy();
    expect(screen.getAllByText(/Quiz drip \(\+2d\) · /).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Your ranges")).toBeTruthy();
    nowSpy.mockRestore();
  });

  it("shows no next drip for paid, unsubscribed, or finished leads", async () => {
    const onOpenMama = vi.fn();
    render(<AdminLeads onOpenMama={onOpenMama} />);
    await waitFor(() => {
      expect(screen.getByText("Megan Wells")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("Megan Wells"));
    await waitFor(() => {
      expect(screen.getByText("No more drips scheduled")).toBeTruthy();
    });
    expect(screen.getByText("She already paid — no conversion drips.")).toBeTruthy();
    expect(screen.queryByText("Still scheduled")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "← Quiz leads" }));
    dbMock.isEmailUnsubscribed.mockResolvedValue(true);
    fireEvent.click(screen.getByText("Ellie Rose"));
    await waitFor(() => {
      expect(screen.getByText("No more drips scheduled")).toBeTruthy();
    });
    expect(screen.getByText("Unsubscribed.")).toBeTruthy();
  });

  it("says no emails sent yet when the address has no log rows", async () => {
    render(<AdminLeads />);
    await waitFor(() => {
      expect(screen.getByText("Ellie Rose")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("Ellie Rose"));
    await waitFor(() => {
      expect(screen.getByText("No emails sent yet.")).toBeTruthy();
    });
    expect(dbMock.loadEmailEventsByEmail).toHaveBeenCalledWith("ellie@example.com");
  });
});
