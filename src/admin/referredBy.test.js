import { describe, expect, it } from "vitest";
import {
  formatReferredBy,
  formatReferredByHint,
  pickReferredBy,
} from "./referredBy.js";

const AVA = "advocate-1";
const MAMA = "referred-1";

const profilesById = {
  [AVA]: { name: "Ava", last_name: "Stone" },
};

function row(over = {}) {
  return {
    referred_user_id: MAMA,
    advocate_user_id: AVA,
    code: "AVA25",
    status: "paid",
    created_at: "2026-08-18T12:00:00.000Z",
    ...over,
  };
}

describe("pickReferredBy", () => {
  it("returns advocate profile name and code for a paid row", () => {
    expect(pickReferredBy({
      rows: [row()],
      profilesById,
      referredUserId: MAMA,
    })).toEqual({ advocateName: "Ava Stone", code: "AVA25" });
  });

  it("includes pending_payment when that is the only row", () => {
    expect(pickReferredBy({
      rows: [row({ status: "pending_payment" })],
      profilesById,
      referredUserId: MAMA,
    })).toEqual({ advocateName: "Ava Stone", code: "AVA25" });
  });

  it("returns null when there is no referral", () => {
    expect(pickReferredBy({
      rows: [],
      profilesById,
      referredUserId: MAMA,
    })).toBeNull();
  });

  it("ignores refunded rows", () => {
    expect(pickReferredBy({
      rows: [row({ status: "refunded" })],
      profilesById,
      referredUserId: MAMA,
    })).toBeNull();
  });

  it("omits the advocate email and uses the code when the profile has no name", () => {
    expect(pickReferredBy({
      rows: [row()],
      profilesById: { [AVA]: { name: "", last_name: "", email: "ava@example.com" } },
      referredUserId: MAMA,
    })).toEqual({ advocateName: "", code: "AVA25" });
  });

  it("prefers paid over an older pending_payment row", () => {
    expect(pickReferredBy({
      rows: [
        row({ status: "pending_payment", created_at: "2026-08-19T12:00:00.000Z", code: "OLD25" }),
        row({ status: "paid", created_at: "2026-08-17T12:00:00.000Z", code: "AVA25" }),
      ],
      profilesById,
      referredUserId: MAMA,
    })).toEqual({ advocateName: "Ava Stone", code: "AVA25" });
  });
});

describe("formatReferredBy", () => {
  it("shows name and code when both exist", () => {
    expect(formatReferredBy({ advocateName: "Ava Stone", code: "AVA25" }))
      .toBe("Referred by Ava Stone · AVA25");
  });

  it("shows the code only when the advocate has no name", () => {
    expect(formatReferredBy({ advocateName: "", code: "AVA25" })).toBe("AVA25");
  });

  it("returns empty when there is no referral", () => {
    expect(formatReferredBy(null)).toBe("");
    expect(formatReferredBy(undefined)).toBe("");
    expect(formatReferredBy({ advocateName: "", code: "" })).toBe("");
  });
});

describe("formatReferredByHint", () => {
  it("keeps the roster hint to a first name", () => {
    expect(formatReferredByHint({ advocateName: "Ava Stone", code: "AVA25" })).toBe("via Ava");
  });

  it("falls back to the code when there is no name", () => {
    expect(formatReferredByHint({ advocateName: "", code: "AVA25" })).toBe("via AVA25");
  });

  it("returns empty when there is no referral", () => {
    expect(formatReferredByHint(null)).toBe("");
  });
});
