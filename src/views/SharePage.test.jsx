// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../auth/useAuth.jsx", () => ({
  useAuth: () => ({
    user: null,
    profile: null,
    loading: false,
    isAdmin: false,
  }),
}));

vi.mock("../lib/supabase", () => ({
  supabase: { auth: { getSession: vi.fn() } },
}));

import { SharePage } from "./SharePage";

afterEach(() => {
  cleanup();
});

const preview = {
  code: "PAT25",
  blurb: "Use code PAT25 to join Callie in her Macros and Mamas 8-week transformation program — you'll save $25. www.macrosandmamas.com",
  friendsEnrolled: 1,
  availableCents: 0,
  pendingCents: 2500,
  vestingDays: 3,
  ambassador: false,
};

describe("SharePage referral stack", () => {
  it("shows the free-month pitch and one friend already stacked", () => {
    render(
      <MemoryRouter>
        <SharePage preview={preview} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Share Macros and Mamas" })).toBeTruthy();
    expect(screen.getByText(/Each friend who enrolls is \$25/)).toBeTruthy();
    expect(screen.getByText(/one free month of the \$49 membership/)).toBeTruthy();
    expect(screen.getByText(/\$25 stacked\. One more friend covers a free month/)).toBeTruthy();
    expect(screen.getByText(/vests in 3 days/)).toBeTruthy();
    expect(screen.getByText("PAT25")).toBeTruthy();
    expect(screen.getByText(/you'll save \$25/)).toBeTruthy();
  });
});
