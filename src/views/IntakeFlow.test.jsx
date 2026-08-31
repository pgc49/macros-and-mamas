// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { birthDateInputBounds } from "../utils/dateOfBirth";

vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
    },
  },
}));

vi.mock("../auth/useAuth.jsx", () => ({
  useAuth: () => ({ user: null, profile: null, isAdmin: false }),
}));

import { IntakeFlow } from "./IntakeFlow.jsx";

afterEach(() => {
  cleanup();
});

const aboutYou = {
  name: "Dolly",
  lastName: "Mama",
  dateOfBirth: "",
  currentWeight: "140",
  goalWeight: "130",
  phone: "5555555555",
};

function renderStep0(profile) {
  return render(
    <MemoryRouter>
      <IntakeFlow
        profile={profile}
        step={0}
        setStep={vi.fn()}
        set={vi.fn()}
        setProfile={vi.fn()}
      />
    </MemoryRouter>,
  );
}

describe("intake date of birth", () => {
  it("exposes the 120-year floor so 1958 and 1945 are selectable", () => {
    renderStep0(aboutYou);
    const input = screen.getByLabelText("Date of birth");
    const { min, max } = birthDateInputBounds();
    expect(input.min).toBe(min);
    expect(input.max).toBe(max);
    expect(input.min <= "1958-06-15").toBe(true);
    expect(input.min <= "1945-01-01").toBe(true);
    expect(input.max < "2099-01-01").toBe(true);
  });

  it("enables Continue when Dolly's 1958 birthday is filled in", () => {
    renderStep0({ ...aboutYou, dateOfBirth: "1958-06-15" });
    expect(screen.getByRole("button", { name: "Continue" }).disabled).toBe(false);
    expect(screen.getByText(/^Age \d+$/)).toBeTruthy();
  });

  it("keeps Continue disabled for a future birthday", () => {
    renderStep0({ ...aboutYou, dateOfBirth: "2099-01-01" });
    expect(screen.getByRole("button", { name: "Continue" }).disabled).toBe(true);
  });
});
