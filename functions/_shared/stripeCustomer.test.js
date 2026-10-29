import { describe, expect, it } from "vitest";
import {
  nextStoredStripeCustomerId,
  reusableStripeCustomerId,
  stripeReportedMissingCustomer,
} from "./stripeCustomer.js";

describe("reusableStripeCustomerId", () => {
  it("keeps real Customer ids", () => {
    expect(reusableStripeCustomerId("cus_realcustomer")).toBe("cus_realcustomer");
  });

  it("rejects guest customers and blanks", () => {
    expect(reusableStripeCustomerId("gcus_guestcustomer")).toBe("");
    expect(reusableStripeCustomerId("")).toBe("");
    expect(reusableStripeCustomerId(null)).toBe("");
    expect(reusableStripeCustomerId("acct_123")).toBe("");
  });
});

describe("nextStoredStripeCustomerId", () => {
  it("fills a blank profile with a real Customer", () => {
    expect(nextStoredStripeCustomerId(null, "cus_realcustomer")).toBe("cus_realcustomer");
  });

  it("replaces a guest id and refuses to store another guest id", () => {
    expect(nextStoredStripeCustomerId("gcus_guestcustomer", "cus_realcustomer")).toBe("cus_realcustomer");
    expect(nextStoredStripeCustomerId(null, "gcus_guestcustomer")).toBeNull();
    expect(nextStoredStripeCustomerId("gcus_guestcustomer", "gcus_otherguest")).toBeNull();
  });

  it("does not clobber a real Customer", () => {
    expect(nextStoredStripeCustomerId("cus_existing", "cus_other")).toBeNull();
  });
});

describe("stripeReportedMissingCustomer", () => {
  it("matches Stripe's missing-customer error", () => {
    expect(stripeReportedMissingCustomer({
      error: {
        code: "resource_missing",
        param: "customer",
        message: "No such customer: 'gcus_guestcustomer'",
        type: "invalid_request_error",
      },
    })).toBe(true);
  });

  it("ignores other Stripe errors", () => {
    expect(stripeReportedMissingCustomer({
      error: { code: "resource_missing", param: "line_items[0][price]", message: "No such price" },
    })).toBe(false);
    expect(stripeReportedMissingCustomer({ error: "checkout failed" })).toBe(false);
    expect(stripeReportedMissingCustomer({})).toBe(false);
  });
});
