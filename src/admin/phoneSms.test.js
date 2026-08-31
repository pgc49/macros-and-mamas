import { describe, expect, it } from "vitest";
import { smsHref } from "./phoneSms.js";

describe("smsHref", () => {
  it("builds an sms: link and keeps a leading plus", () => {
    expect(smsHref("555-0199")).toBe("sms:5550199");
    expect(smsHref("+1 (555) 010-0100")).toBe("sms:+15550100100");
  });

  it("returns empty when there is no number", () => {
    expect(smsHref("")).toBe("");
    expect(smsHref(" — ")).toBe("");
  });
});
