// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captureMessage = vi.fn();

vi.mock("@sentry/react", () => ({
  captureMessage: (...args) => captureMessage(...args),
}));

import {
  captureQuizSignupBounce,
  isQuizSignupBounce,
  resetQuizSignupBounceDedupe,
  signedOutJoinRedirect,
} from "./quizSignupBounce";

beforeEach(() => {
  captureMessage.mockReset();
  resetQuizSignupBounceDedupe();
  sessionStorage.clear();
});

afterEach(() => {
  resetQuizSignupBounceDedupe();
  sessionStorage.clear();
});

describe("isQuizSignupBounce", () => {
  it("is true only on the quiz / from=quiz hop", () => {
    expect(isQuizSignupBounce({
      search: "from=quiz&email=mama@example.com",
      toPath: "/signin?from=quiz&auth=create&email=mama%40example.com",
    })).toBe(true);
    expect(isQuizSignupBounce({
      search: "auth=create",
      toPath: "/signin?auth=create",
    })).toBe(false);
    expect(isQuizSignupBounce({
      search: "",
      toPath: "/signin",
    })).toBe(false);
  });
});

describe("captureQuizSignupBounce", () => {
  it("sends a warning with funnel tags and extras", () => {
    const fired = captureQuizSignupBounce({
      fromPath: "/join",
      toPath: "/signin?from=quiz&auth=create&email=mama%40example.com",
      userSet: false,
      emailQueryPresent: true,
      existingAccountFlip: false,
      search: "from=quiz&email=mama@example.com",
    });

    expect(fired).toBe(true);
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage).toHaveBeenCalledWith("quiz_signup_bounce", {
      level: "warning",
      tags: { funnel: "quiz_signup", surface: "customer" },
      extra: {
        fromPath: "/join",
        toPath: "/signin?from=quiz&auth=create&email=mama%40example.com",
        userSet: false,
        emailQueryPresent: true,
        existingAccountFlip: false,
      },
      fingerprint: ["quiz_signup_bounce"],
    });
  });

  it("does not fire on a normal create-account redirect", () => {
    expect(captureQuizSignupBounce({
      fromPath: "/join",
      toPath: "/signin?auth=create",
      userSet: false,
      emailQueryPresent: false,
      search: "auth=create",
    })).toBe(false);
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("dedupes the same quiz hop so a loop cannot flood", () => {
    const payload = {
      fromPath: "/join",
      toPath: "/signin?from=quiz&auth=create",
      userSet: false,
      emailQueryPresent: true,
      search: "from=quiz",
      now: 1_000,
    };
    expect(captureQuizSignupBounce(payload)).toBe(true);
    expect(captureQuizSignupBounce({ ...payload, now: 10_000 })).toBe(false);
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureQuizSignupBounce({ ...payload, now: 40_000 })).toBe(true);
    expect(captureMessage).toHaveBeenCalledTimes(2);
  });
});

describe("signedOutJoinRedirect", () => {
  it("captures when /join sends a quiz mama back to create-account", () => {
    const to = signedOutJoinRedirect({
      search: "?from=quiz&email=pgchammas%2Btest321%40gmail.com",
      user: null,
    });
    expect(to).toBe(
      "/signin?from=quiz&auth=create&email=pgchammas%2Btest321%40gmail.com",
    );
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage.mock.calls[0][0]).toBe("quiz_signup_bounce");
    expect(captureMessage.mock.calls[0][1].extra).toMatchObject({
      fromPath: "/join",
      userSet: false,
      emailQueryPresent: true,
      existingAccountFlip: false,
    });
  });

  it("promotes a join ?email= hop to quiz and still captures", () => {
    signedOutJoinRedirect({
      search: "?email=mama@example.com",
      user: null,
    });
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage.mock.calls[0][1].extra.toPath).toContain("from=quiz");
  });

  it("does not capture a normal unpaid join → create-account hop", () => {
    const to = signedOutJoinRedirect({ search: "", user: null });
    expect(to).toEqual({ pathname: "/signin", search: "?auth=create" });
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("does not redirect or capture when a session is already set", () => {
    expect(signedOutJoinRedirect({
      search: "from=quiz&email=mama@example.com",
      user: { id: "u1" },
    })).toBeNull();
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("does not capture while JoinGate is still holding for auth", () => {
    expect(signedOutJoinRedirect({
      search: "from=quiz&email=mama@example.com",
      user: null,
      authLoading: true,
    })).toBeNull();
    expect(captureMessage).not.toHaveBeenCalled();
  });
});
