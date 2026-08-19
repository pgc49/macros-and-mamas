// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import {
  clearQuizPayHandoff,
  isQuizPayHandoffActive,
  joinCheckoutDecision,
  joinPathWhenSignedOut,
  markQuizPayHandoff,
  quizSessionMismatch,
  shouldAcceptGetSession,
  shouldSwitchCreateToSignIn,
  urlQuizEmail,
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

describe("joinCheckoutDecision", () => {
  it("holds /join until the session probe finishes", () => {
    expect(joinCheckoutDecision({
      user: null,
      authLoading: false,
      probeDone: false,
      supabaseHasSession: false,
    })).toBe("hold");
  });

  it("stays on checkout when Supabase has a session even if React user is late", () => {
    expect(joinCheckoutDecision({
      user: null,
      authLoading: false,
      probeDone: true,
      supabaseHasSession: true,
    })).toBe("stay");
  });

  it("sends a probed signed-out visitor to create-account", () => {
    expect(joinCheckoutDecision({
      user: null,
      authLoading: false,
      probeDone: true,
      supabaseHasSession: false,
    })).toBe("signin");
  });

  it("holds checkout after create-account even before the session probe", () => {
    expect(joinCheckoutDecision({
      user: null,
      authLoading: false,
      probeDone: true,
      supabaseHasSession: false,
      handoffActive: true,
    })).toBe("hold");
  });
});

afterEach(() => {
  clearQuizPayHandoff();
});

describe("quiz pay handoff stamp", () => {
  it("stays active just after mark and clears", () => {
    markQuizPayHandoff("mama+quiz@example.com");
    expect(isQuizPayHandoffActive()).toBe(true);
    clearQuizPayHandoff();
    expect(isQuizPayHandoffActive()).toBe(false);
  });
});

describe("urlQuizEmail", () => {
  it("reads the URL address and ignores a stale stored one", () => {
    sessionStorage.setItem("mm_quiz_email", "old+attempt@example.com");
    expect(urlQuizEmail(new URLSearchParams("from=quiz"))).toBe("");
    expect(urlQuizEmail(new URLSearchParams("from=quiz&email=mama%2Bnew%40example.com")))
      .toBe("mama+new@example.com");
    sessionStorage.removeItem("mm_quiz_email");
  });
});

describe("shouldAcceptGetSession", () => {
  it("ignores a stale anonymous getSession after signup applied a user", () => {
    expect(shouldAcceptGetSession(null, true)).toBe(false);
    expect(shouldAcceptGetSession({ user: { id: "u1" } }, false)).toBe(true);
    expect(shouldAcceptGetSession(null, false)).toBe(true);
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
