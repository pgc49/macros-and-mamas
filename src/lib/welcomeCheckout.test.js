import { describe, expect, it } from "vitest";
import { welcomeCheckoutDecision } from "./welcomeCheckout";

describe("welcomeCheckoutDecision", () => {
  it("bounces unpaid users with no Stripe session_id to /join", () => {
    expect(welcomeCheckoutDecision({ paid: false, search: "" })).toBe("join");
    expect(welcomeCheckoutDecision({ paid: false, search: "?from=quiz" })).toBe("join");
    expect(welcomeCheckoutDecision({ paid: false })).toBe("join");
  });

  it("polls when Stripe sent her back with a session_id", () => {
    expect(welcomeCheckoutDecision({
      paid: false,
      search: "?session_id=cs_test_abc",
    })).toBe("poll");
  });

  it("stays on the ready path once she is paid, with or without session_id", () => {
    expect(welcomeCheckoutDecision({ paid: true, search: "" })).toBe("stay");
    expect(welcomeCheckoutDecision({
      paid: true,
      search: "?session_id=cs_test_abc",
    })).toBe("stay");
  });

  it("holds until paid is known — does not bounce a returning mama to /join", () => {
    expect(welcomeCheckoutDecision({
      paid: false,
      loaded: false,
      search: "",
    })).toBe("hold");
    expect(welcomeCheckoutDecision({
      paid: false,
      loaded: false,
      search: "?session_id=cs_test_abc",
    })).toBe("hold");
  });
});
