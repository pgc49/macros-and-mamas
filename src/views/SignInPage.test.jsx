// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../auth/useAuth.jsx", () => ({
  useAuth: () => ({
    signInWithPassword: vi.fn(async () => ({ error: null })),
    signUpWithPassword: vi.fn(async () => ({ error: null })),
    resetPasswordForEmail: vi.fn(async () => ({ error: null })),
  }),
}));

vi.mock("../config", async () => {
  const actual = await vi.importActual("../config");
  return {
    ...actual,
    isEnrollmentOpen: () => true,
  };
});

import { SignInPage } from "./SignInPage";

afterEach(() => {
  cleanup();
});

const quizSearch = "/signin?from=quiz&auth=signin&email=pgchammas%2Bmetaadspaidtest%40gmail.com";

describe("SignInPage quiz handoff", () => {
  it("locks the quiz email on sign-in so a different account cannot bounce the session", () => {
    render(
      <MemoryRouter initialEntries={[quizSearch]}>
        <SignInPage mode="signin" onSwitchMode={() => {}} />
      </MemoryRouter>,
    );
    const input = screen.getByPlaceholderText("you@email.com");
    expect(input.value).toBe("pgchammas+metaadspaidtest@gmail.com");
    expect(input.readOnly).toBe(true);
    expect(screen.getByText(/password you created for this quiz email/i)).toBeTruthy();
  });
});
