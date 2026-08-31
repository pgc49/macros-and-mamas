// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import {
  clearQuizPayHandoff,
  isQuizPayHandoffActive,
  joinAfterAuthDecision,
  joinCheckoutDecision,
  joinPathWhenSignedOut,
  markQuizPayHandoff,
  quizSessionMismatch,
  shouldAcceptGetSession,
  shouldSkipProfileHold,
  shouldSwitchCreateToSignIn,
  signInPostAuthDecision,
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

describe("signInPostAuthDecision", () => {
  const mama = { id: "u1", email: "mama@example.com" };

  it("holds a returning sign-in until paid is known — does not send her to /join", () => {
    expect(signInPostAuthDecision({
      user: mama,
      authLoading: false,
      loaded: false,
      fromQuiz: false,
    })).toEqual({ action: "hold" });
  });

  it("sends a loaded paid-or-unpaid session through homePathFor", () => {
    expect(signInPostAuthDecision({
      user: mama,
      authLoading: false,
      loaded: true,
      fromQuiz: false,
    })).toEqual({ action: "home" });
  });

  it("sends quiz Lock my spot to checkout before the profile row lands", () => {
    expect(signInPostAuthDecision({
      user: mama,
      authLoading: false,
      loaded: false,
      fromQuiz: true,
      quizEmail: "mama@example.com",
    })).toEqual({
      action: "go",
      to: "/join?from=quiz&email=mama%40example.com",
    });
  });

  it("does not treat the handoff stamp as from=quiz (Welcome back also stamps it)", () => {
    markQuizPayHandoff(mama.email);
    expect(signInPostAuthDecision({
      user: mama,
      authLoading: false,
      loaded: false,
      fromQuiz: false,
    })).toEqual({ action: "hold" });
  });

  it("keeps support and account deep-links", () => {
    expect(signInPostAuthDecision({
      user: mama,
      authLoading: false,
      loaded: false,
      fromPath: "/support",
    })).toEqual({ action: "go", to: "/support" });
    expect(signInPostAuthDecision({
      user: mama,
      authLoading: false,
      loaded: false,
      fromPath: "/account/profile",
    })).toEqual({ action: "go", to: "/account/profile" });
  });

  it("shows the form when signed out", () => {
    expect(signInPostAuthDecision({
      user: null,
      authLoading: false,
      loaded: true,
    })).toEqual({ action: "signin" });
  });
});

describe("shouldSkipProfileHold", () => {
  it("skips only /join and quiz /signin", () => {
    expect(shouldSkipProfileHold({ pathname: "/join" })).toBe(true);
    expect(shouldSkipProfileHold({ pathname: "/signin", fromQuiz: true })).toBe(true);
    expect(shouldSkipProfileHold({ pathname: "/signin/", fromQuiz: true })).toBe(true);
    expect(shouldSkipProfileHold({ pathname: "/signin", fromQuiz: false })).toBe(false);
    expect(shouldSkipProfileHold({ pathname: "/dashboard" })).toBe(false);
  });
});

describe("joinAfterAuthDecision", () => {
  const mama = { id: "u1", email: "mama@example.com" };

  it("holds a returning session on /join until paid is known", () => {
    expect(joinAfterAuthDecision({
      user: mama,
      loaded: false,
      fromQuiz: false,
      paid: false,
    })).toEqual({ action: "hold" });
  });

  it("shows quiz checkout before the profile row lands", () => {
    expect(joinAfterAuthDecision({
      user: mama,
      loaded: false,
      fromQuiz: true,
      paid: false,
    })).toEqual({ action: "checkout" });
  });

  it("sends a loaded paid mama home instead of painting Stripe", () => {
    expect(joinAfterAuthDecision({
      user: mama,
      loaded: true,
      fromQuiz: false,
      paid: true,
    })).toEqual({ action: "home" });
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
