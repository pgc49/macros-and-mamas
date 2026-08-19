import { describe, expect, it } from "vitest";
import {
  joinPathWhenSignedOut,
  quizSessionMismatch,
  shouldSwitchCreateToSignIn,
} from "./quizAuthHandoff";

describe("quizSessionMismatch", () => {
  it("does not sign out a new session before email is on the user", () => {
    expect(quizSessionMismatch({
      user: { id: "u1" },
      fromQuiz: true,
      quizEmail: "mama@example.com",
    })).toBe(false);
  });

  it("signs out only when a different email is already signed in", () => {
    expect(quizSessionMismatch({
      user: { id: "u1", email: "other@example.com" },
      fromQuiz: true,
      quizEmail: "mama@example.com",
    })).toBe(true);
    expect(quizSessionMismatch({
      user: { id: "u1", email: "mama@example.com" },
      fromQuiz: true,
      quizEmail: "mama@example.com",
    })).toBe(false);
  });
});

describe("joinPathWhenSignedOut", () => {
  it("stays on /join while auth is applying the new session", () => {
    expect(joinPathWhenSignedOut({
      user: null,
      authLoading: true,
      search: "from=quiz&email=mama@example.com",
    })).toBeNull();
    expect(joinPathWhenSignedOut({
      user: { id: "u1", email: "mama@example.com" },
      authLoading: false,
      search: "from=quiz&email=mama@example.com",
    })).toBeNull();
  });

  it("sends a settled signed-out quiz visitor back to create-account", () => {
    expect(joinPathWhenSignedOut({
      user: null,
      authLoading: false,
      search: "from=quiz&email=mama+quiz@example.com",
    })).toBe("/signin?from=quiz&auth=create&email=mama%2Bquiz%40example.com");
  });
});

describe("shouldSwitchCreateToSignIn", () => {
  it("does not treat Invalid login as an existing-account flip", () => {
    expect(shouldSwitchCreateToSignIn({
      existingAccount: false,
      message: "Invalid login credentials",
    })).toBe(false);
  });

  it("flips when signup reports the email is already registered", () => {
    expect(shouldSwitchCreateToSignIn({
      existingAccount: true,
      message: "Invalid login credentials",
    })).toBe(true);
    expect(shouldSwitchCreateToSignIn({
      message: "User already registered",
    })).toBe(true);
  });
});
