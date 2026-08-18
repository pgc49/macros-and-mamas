import { describe, expect, it } from "vitest";
import { canOpenBillingPortal } from "./billing";

describe("canOpenBillingPortal", () => {
  it("is hidden when Stripe has no customer for this account", () => {
    expect(canOpenBillingPortal({ portalAvailable: false })).toBe(false);
    expect(canOpenBillingPortal({})).toBe(false);
    expect(canOpenBillingPortal(null)).toBe(false);
  });

  it("is shown only when the billing summary says the portal is available", () => {
    expect(canOpenBillingPortal({ portalAvailable: true })).toBe(true);
  });
});
