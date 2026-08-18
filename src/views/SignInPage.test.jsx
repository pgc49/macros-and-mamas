// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const signUpWithPassword = vi.fn(async () => ({ error: null }));
const signInWithPassword = vi.fn(async () => ({ error: null }));
const resetPasswordForEmail = vi.fn(async () => ({ error: null }));

vi.mock("../auth/useAuth.jsx", () => ({
  useAuth: () => ({
    signInWithPassword,
    signUpWithPassword,
    resetPasswordForEmail,
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
  signUpWithPassword.mockReset();
  signInWithPassword.mockReset();
  resetPasswordForEmail.mockReset();
  signUpWithPassword.mockResolvedValue({ error: null });
  signInWithPassword.mockResolvedValue({ error: null });
  resetPasswordForEmail.mockResolvedValue({ error: null });
});

const quizCreate = "/signin?from=quiz&auth=create&email=pgchammas%2Btestaccount%40gmail.com";

function renderSignIn(path, props = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SignInPage mode="create" onSwitchMode={() => {}} {...props} />
    </MemoryRouter>,
  );
}

describe("SignInPage quiz handoff", () => {
  it("locks the quiz email on sign-in so a different account cannot bounce the session", () => {
    render(
      <MemoryRouter initialEntries={["/signin?from=quiz&auth=signin&email=pgchammas%2Bmetaadspaidtest%40gmail.com"]}>
        <SignInPage mode="signin" onSwitchMode={() => {}} />
      </MemoryRouter>,
    );
    const input = screen.getByPlaceholderText("you@email.com");
    expect(input.value).toBe("pgchammas+metaadspaidtest@gmail.com");
    expect(input.readOnly).toBe(true);
    expect(screen.getByText(/password you created for this quiz email/i)).toBeTruthy();
  });

  it("restores a plus-alias that arrived as a space and still offers forgot password on create", () => {
    renderSignIn("/signin?from=quiz&auth=create&email=pgchammas%20testaccount%40gmail.com");
    const input = screen.getByPlaceholderText("you@email.com");
    expect(input.value).toBe("pgchammas+testaccount@gmail.com");
    expect(screen.getByText("Forgot password?")).toBeTruthy();
  });

  it("switches to sign-in when that quiz email already has an account", async () => {
    signUpWithPassword.mockResolvedValueOnce({
      error: { message: "User already registered" },
    });
    const onSwitchMode = vi.fn();
    renderSignIn(quizCreate, { onSwitchMode });

    fireEvent.click(screen.getByLabelText(/I agree to the/i));
    fireEvent.change(screen.getByPlaceholderText("At least 6 characters"), {
      target: { value: "secret1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(onSwitchMode).toHaveBeenCalledWith("signin");
    });
    expect(screen.getByText(/already has an account/i)).toBeTruthy();
    expect(signUpWithPassword).toHaveBeenCalledWith(
      "pgchammas+testaccount@gmail.com",
      "secret1",
      expect.objectContaining({ termsVersion: expect.any(String) }),
    );
  });
});
