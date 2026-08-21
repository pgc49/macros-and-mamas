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
    utm_campaign: "aug_founding",
    utm_content: "story_1",
    landing_path: "/quiz",
    months_postpartum: "3_12_months",
    feeding_status: "exclusive",
    goal: "lose_sustainable",
    activity_level: "moderate",
    height_in: 64,
    current_weight_lbs: 160,
    goal_weight_lbs: 150,
    referred_by: null,
    flags: ["vegan"],
    segment: "waitlist_plantbased",
    needs_review: true,
    review_reason: "carbs_under_100",
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
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
    landing_path: null,
    referred_by: "Sarah",
    profileCreatedAt: "2026-08-18T17:00:00.000Z",
    profilePaidAt: "2026-08-18T18:00:00.000Z",
    phone: "555-0199",
    profileStatus: "active",
    macrosExists: true,
    macrosApproved: true,
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
    expect(screen.getByText("Plant-based · Vegan · Needs review")).toBeTruthy();
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

  it("shows quiz, landing, and campaign on quiz-only lead detail", async () => {
    render(<AdminLeads />);
    await waitFor(() => {
      expect(screen.getByText("Ellie Rose")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("Ellie Rose"));
    await waitFor(() => {
      expect(screen.getByText("Activity")).toBeTruthy();
    });
    expect(screen.getByText("First quiz")).toBeTruthy();
    expect(screen.queryByText("Quiz completed")).toBeNull();
    expect(screen.queryByText(/last quiz|last visit/i)).toBeNull();
    expect(screen.getByText("Aug 19, 11:30 AM PT")).toBeTruthy();
    expect(screen.getByText("Landing")).toBeTruthy();
    expect(screen.getByText("/quiz")).toBeTruthy();
    expect(screen.getByText("Campaign")).toBeTruthy();
    expect(screen.getByText("meta / cpc / aug_founding / story_1")).toBeTruthy();
    expect(screen.getByText("Source")).toBeTruthy();
    expect(screen.getAllByText("Meta ad").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Account created")).toBeNull();
    expect(screen.queryByText("Paid")).toBeNull();
    expect(screen.queryByText(/0 visits/i)).toBeNull();
    expect(screen.queryByText(/fb\.1\.1/)).toBeNull();
  });

  it("shows account and paid timestamps on a paid lead", async () => {
    render(<AdminLeads />);
    await waitFor(() => {
      expect(screen.getByText("Megan Wells")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("Megan Wells"));
    await waitFor(() => {
      expect(screen.getByText("Activity")).toBeTruthy();
    });
    expect(screen.getByText("First quiz")).toBeTruthy();
    expect(screen.getByText("Account created")).toBeTruthy();
    expect(screen.getByText("Aug 18, 10:00 AM PT")).toBeTruthy();
    expect(screen.getByText("Paid")).toBeTruthy();
    expect(screen.getByText("Aug 18, 11:00 AM PT")).toBeTruthy();
    expect(screen.getByText("Referral · Sarah")).toBeTruthy();
    expect(screen.getByText("Phone")).toBeTruthy();
    expect(screen.getByText("555-0199")).toBeTruthy();
    expect(screen.getByText("Intake")).toBeTruthy();
    expect(screen.getByText("Approved")).toBeTruthy();
  });

  it("omits missing landing path and campaign UTMs on lead detail", async () => {
    render(<AdminLeads />);
    await waitFor(() => {
      expect(screen.getByText("Megan Wells")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("Megan Wells"));
    await waitFor(() => {
      expect(screen.getByText("Activity")).toBeTruthy();
    });
    expect(screen.queryByText("Landing")).toBeNull();
    expect(screen.queryByText("Campaign")).toBeNull();
    expect(screen.queryByText(/utm_/)).toBeNull();
    expect(screen.queryByText("Waitlist")).toBeNull();
    expect(screen.queryByText("Eligibility")).toBeNull();
  });

  it("shows waitlist, eligibility, and quiz vs signup campaign when those rows exist", async () => {
    loadQuizLeads.mockResolvedValue([
      {
        ...rows[0],
        email: "ivy@example.com",
        first_name: "Ivy",
        last_name: "Lane",
        utm_source: "meta",
        utm_medium: "cpc",
        utm_campaign: "aug_founding",
        utm_content: null,
        landing_path: "/quiz",
        profileId: "ivy-id",
        funnelStatus: "signed_up_unpaid",
        profileCreatedAt: "2026-08-18T17:00:00.000Z",
        profileAttribution: {
          utm_source: "google",
          utm_medium: "cpc",
          utm_campaign: "brand",
          landing_path: "/join",
        },
        phone: "555-0144",
        cohortWaitlist: {
          created_at: "2026-08-10T19:00:00.000Z",
          converted_at: "2026-08-18T17:00:00.000Z",
        },
        eligibilityWaitlist: {
          reason: "pregnant",
          created_at: "2026-08-09T18:00:00.000Z",
        },
        macrosExists: true,
        macrosApproved: false,
      },
    ]);
    render(<AdminLeads />);
    await waitFor(() => {
      expect(screen.getByText("Ivy Lane")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("Ivy Lane"));
    await waitFor(() => {
      expect(screen.getByText("Activity")).toBeTruthy();
    });
    expect(screen.getByText("First quiz")).toBeTruthy();
    expect(screen.getByText("555-0144")).toBeTruthy();
    expect(screen.getByText("quiz meta / cpc / aug_founding · signup google / cpc / brand")).toBeTruthy();
    expect(screen.getByText("Aug 10, 12:00 PM PT · converted")).toBeTruthy();
    expect(screen.getByText("Pregnant · Aug 9, 11:00 AM PT")).toBeTruthy();
    expect(screen.getByText("Submitted")).toBeTruthy();
    expect(screen.getByText("Signed up, unpaid")).toBeTruthy();
    expect(screen.queryByText(/last quiz|last visit|0 visits|checkout-started|sentry/i)).toBeNull();
  });

  it("shows quiz answers and computed ranges on lead detail", async () => {
    render(<AdminLeads />);
    await waitFor(() => {
      expect(screen.getByText("Ellie Rose")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("Ellie Rose"));
    await waitFor(() => {
      expect(screen.getByText("Answers")).toBeTruthy();
    });
    expect(screen.getByText("Results")).toBeTruthy();
    expect(screen.getByText("Where are you right now?")).toBeTruthy();
    expect(screen.getByText("3–12 months")).toBeTruthy();
    expect(screen.getByText("Are you feeding your baby breast milk right now?")).toBeTruthy();
    expect(screen.getByText("Exclusive breast milk")).toBeTruthy();
    expect(screen.getByText("Height")).toBeTruthy();
    expect(screen.getByText("5 ft 4 in")).toBeTruthy();
    expect(screen.getByText("Current weight (lb)")).toBeTruthy();
    expect(screen.getByText("160 lb")).toBeTruthy();
    expect(screen.getByText("What weight do you feel like yourself at?")).toBeTruthy();
    expect(screen.getByText("150 lb")).toBeTruthy();
    expect(screen.getByText("What are you actually after?")).toBeTruthy();
    expect(screen.getByText("Lose fat — keep muscle and milk")).toBeTruthy();
    expect(screen.getByText("How much are you moving right now?")).toBeTruthy();
    expect(screen.getByText("Moderate movement")).toBeTruthy();
    expect(screen.getByText("Anything we should know?")).toBeTruthy();
    expect(screen.getByText("Fully vegan")).toBeTruthy();
    expect(screen.getByText("Ranges")).toBeTruthy();
    expect(screen.getByText("90–110P · 150–190C · 45–60F · 1700–1900 cal")).toBeTruthy();
    expect(screen.getByText("Plant-based · Vegan · Needs review")).toBeTruthy();
    expect(screen.getByText("Carbs under 100")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Email" })).toBeTruthy();
    expect(screen.getByText("Activity")).toBeTruthy();
    expect(screen.queryByText("Quiz results")).toBeNull();
  });

  it("omits blank quiz answers and results on a sparse lead", async () => {
    loadQuizLeads.mockResolvedValue([
      {
        id: "lead-sparse",
        email: "sparse@example.com",
        first_name: "Sam",
        last_name: "Bare",
        created_at: "2026-08-19T18:30:00.000Z",
        flags: [],
        segment: "main",
        landing_path: "/quiz",
        utm_source: "meta",
        utm_medium: "cpc",
        protein_low_g: null,
        protein_high_g: null,
        carbs_low_g: null,
        carbs_high_g: null,
        fat_low_g: null,
        fat_high_g: null,
        calories_low: null,
        calories_high: null,
        months_postpartum: "",
        feeding_status: null,
        goal: null,
        activity_level: null,
        height_in: null,
        current_weight_lbs: null,
        goal_weight_lbs: null,
        needs_review: false,
        profileId: null,
        funnelStatus: "quiz_only",
        sourceKind: "meta_ad",
        isMeta: true,
      },
    ]);
    render(<AdminLeads />);
    await waitFor(() => {
      expect(screen.getByText("Sam Bare")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("Sam Bare"));
    await waitFor(() => {
      expect(screen.getByText("Activity")).toBeTruthy();
    });
    expect(screen.queryByText("Answers")).toBeNull();
    expect(screen.queryByText("Results")).toBeNull();
    expect(screen.queryByText("Quiz results")).toBeNull();
    expect(screen.queryByText("Ranges")).toBeNull();
    expect(screen.queryByText("Where are you right now?")).toBeNull();
    expect(screen.queryByText("Height")).toBeNull();
    expect(screen.queryByText("Current weight (lb)")).toBeNull();
    expect(screen.queryByText("Review")).toBeNull();
    expect(screen.getByText("Landing")).toBeTruthy();
    expect(screen.getByText("/quiz")).toBeTruthy();
  });
});
