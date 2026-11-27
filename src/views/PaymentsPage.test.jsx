// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const fetchBillingSummary = vi.hoisted(() => vi.fn());
const cancelMembership = vi.hoisted(() => vi.fn());
const resumeMembership = vi.hoisted(() => vi.fn());
const startMembershipCheckout = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({
  user: { email: "mama@example.com" },
  profile: { paid: true, refunded: false, name: "Ava", cohort_label: "2026-11" },
  loading: false,
  isAdmin: false,
  refreshProfile: vi.fn(async () => {}),
}));

vi.mock("../auth/useAuth.jsx", () => ({
  useAuth: () => authState,
}));

vi.mock("../lib/billing", () => ({
  canOpenBillingPortal: () => false,
  fetchBillingSummary,
  openBillingPortal: vi.fn(),
  cancelMembership,
  resumeMembership,
  startMembershipCheckout,
}));

import { PaymentsPage } from "./PaymentsPage";

afterEach(() => {
  cleanup();
  fetchBillingSummary.mockReset();
  cancelMembership.mockReset();
  resumeMembership.mockReset();
  startMembershipCheckout.mockReset();
  authState.refreshProfile.mockClear();
});

function summary(subscription) {
  return {
    program: { label: "8-week program", phase: "program_complete", amount: 249, currency: "usd" },
    payments: [],
    portalAvailable: false,
    subscription,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <PaymentsPage />
    </MemoryRouter>,
  );
}

describe("PaymentsPage membership cancel and resubscribe", () => {
  it("confirms before canceling, then shows the scheduled end", async () => {
    fetchBillingSummary.mockResolvedValue(summary({
      status: "active",
      priceLabel: "Monthly membership",
      amount: 49,
      currency: "usd",
      renewsAt: "2026-12-27T00:00:00.000Z",
      canCancel: true,
      canResume: false,
      cancelAtPeriodEnd: false,
      canSubscribe: false,
      note: "Your monthly membership is active.",
      benefits: ["Your ranges"],
    }));
    cancelMembership.mockResolvedValue({
      subscription: {
        status: "active",
        priceLabel: "Monthly membership",
        amount: 49,
        currency: "usd",
        endsAt: "2026-12-27T00:00:00.000Z",
        canCancel: false,
        canResume: true,
        cancelAtPeriodEnd: true,
        canSubscribe: false,
        note: "This membership ends Dec 27, 2026. You won't be charged again.",
        periodLabel: "Access through Dec 27, 2026",
        benefits: ["Your ranges"],
      },
    });

    renderPage();
    expect(await screen.findByRole("button", { name: "Cancel membership" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel membership" }));
    expect(screen.getByText("Cancel monthly membership?")).toBeTruthy();
    expect(screen.getByText(/You keep your ranges, logging, and Alumni chat through/)).toBeTruthy();
    expect(cancelMembership).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Keep membership" }));
    expect(cancelMembership).not.toHaveBeenCalled();
    expect(screen.queryByText("Cancel monthly membership?")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Cancel membership" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel membership" }));
    expect(await screen.findByText(/Membership will end on the date above/)).toBeTruthy();
    expect(cancelMembership).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Turn membership back on" })).toBeTruthy();
    expect(screen.queryByText(/Renews /)).toBeNull();
  });

  it("turns a scheduled cancel back on", async () => {
    fetchBillingSummary.mockResolvedValue(summary({
      status: "active",
      priceLabel: "Monthly membership",
      amount: 49,
      currency: "usd",
      canCancel: false,
      canResume: true,
      cancelAtPeriodEnd: true,
      endsAt: "2026-12-27T00:00:00.000Z",
      canSubscribe: false,
      note: "This membership ends Dec 27, 2026.",
      periodLabel: "Access through Dec 27, 2026",
      benefits: ["Your ranges"],
    }));
    resumeMembership.mockResolvedValue({
      subscription: {
        status: "active",
        priceLabel: "Monthly membership",
        amount: 49,
        currency: "usd",
        renewsAt: "2026-12-27T00:00:00.000Z",
        canCancel: true,
        canResume: false,
        cancelAtPeriodEnd: false,
        canSubscribe: false,
        note: "Your monthly membership is active.",
        benefits: ["Your ranges"],
      },
    });

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Turn membership back on" }));
    expect(await screen.findByText("Membership is back on. It will renew as usual.")).toBeTruthy();
    expect(resumeMembership).toHaveBeenCalledOnce();
    expect(screen.getByText(/Renews /)).toBeTruthy();
  });

  it("offers subscribe again after the membership has ended", async () => {
    fetchBillingSummary.mockResolvedValue(summary({
      status: "required",
      priceLabel: "Monthly membership",
      amount: 49,
      currency: "usd",
      canCancel: false,
      canResume: false,
      canSubscribe: true,
      resubscribe: true,
      priceConfigured: true,
      note: "Your monthly membership has ended. Subscribe again to keep logging, your ranges, and Alumni chat.",
      benefits: ["Your ranges"],
    }));
    startMembershipCheckout.mockResolvedValue({ url: "https://checkout.stripe.test/again" });

    renderPage();
    const button = await screen.findByRole("button", { name: "Subscribe again — $49/mo" });
    fireEvent.click(button);
    expect(startMembershipCheckout).toHaveBeenCalledOnce();
  });
});
