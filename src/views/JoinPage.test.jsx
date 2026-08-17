// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../auth/useAuth.jsx", () => ({
  useAuth: () => ({
    user: { email: "pgchammas+metatest@gmail.com" },
    signOut: vi.fn(),
  }),
}));

vi.mock("../lib/checkout", () => ({
  fetchCheckoutQuote: vi.fn(async () => ({ tier: "waitlist", amount: 249 })),
  startCheckout: vi.fn(),
}));

import { JoinPage } from "./JoinPage";

afterEach(() => {
  cleanup();
});

function renderJoin(path = "/join") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <JoinPage />
    </MemoryRouter>,
  );
}

describe("JoinPage referral field", () => {
  it("hides the input behind a Referral code caret and never mentions $25", async () => {
    renderJoin();
    await waitFor(() => {
      expect(screen.getByText("Referral code")).toBeTruthy();
    });
    expect(screen.queryByText(/\$25/)).toBeNull();
    expect(screen.queryByText(/Friend/)).toBeNull();
    const details = document.querySelector(".mm-ref-code");
    expect(details?.open).toBe(false);

    fireEvent.click(screen.getByText("Referral code"));
    expect(details?.open).toBe(true);
    expect(screen.getByPlaceholderText("e.g. SARAH25")).toBeTruthy();
  });

  it("opens with a prefilled code from ?ref=", async () => {
    renderJoin("/join?ref=PATRICK25");
    await waitFor(() => {
      expect(screen.getByDisplayValue("PATRICK25")).toBeTruthy();
    });
  });
});
