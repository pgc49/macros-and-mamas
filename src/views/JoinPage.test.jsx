// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const captureMessage = vi.fn();
const signOut = vi.fn(async () => {});

vi.mock("@sentry/react", () => ({
  captureMessage: (...args) => captureMessage(...args),
}));

vi.mock("../auth/useAuth.jsx", () => ({
  useAuth: () => ({
    user: { email: "pgchammas+metatest@gmail.com" },
    signOut,
  }),
}));

vi.mock("../lib/checkout", () => ({
  fetchCheckoutQuote: vi.fn(async () => ({ tier: "waitlist", amount: 249 })),
  startCheckout: vi.fn(),
}));

import { JoinPage } from "./JoinPage";

afterEach(() => {
  cleanup();
  captureMessage.mockReset();
  signOut.mockReset();
  signOut.mockResolvedValue();
  sessionStorage.clear();
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

  it("captures a quiz bounce when /join switches back to the quiz email", async () => {
    vi.stubGlobal("location", { ...window.location, assign: vi.fn() });
    renderJoin("/join?from=quiz&email=pgchammas%2Bquiz%40gmail.com");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Continue with quiz email/i })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: /Continue with quiz email/i }));
    await waitFor(() => {
      expect(captureMessage).toHaveBeenCalledWith(
        "quiz_signup_bounce",
        expect.objectContaining({
          level: "warning",
          extra: expect.objectContaining({
            fromPath: "/join",
            userSet: true,
            emailQueryPresent: true,
            existingAccountFlip: false,
          }),
        }),
      );
    });
    vi.unstubAllGlobals();
  });

  it("still shows checkout when only a stale stored quiz email disagrees", async () => {
    sessionStorage.setItem("mm_quiz_email", "pgchammas+oldattempt@gmail.com");
    renderJoin("/join?from=quiz");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /lock my spot/i })).toBeTruthy();
    });
    expect(screen.queryByText(/Use your quiz email to checkout/i)).toBeNull();
  });

  it("opens with a prefilled code from ?ref=", async () => {
    renderJoin("/join?ref=PATRICK25");
    await waitFor(() => {
      expect(screen.getByDisplayValue("PATRICK25")).toBeTruthy();
    });
  });
});
