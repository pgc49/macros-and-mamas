import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildCapiUserData,
  matchFieldsFromProfileAndCheckout,
  normalizeCapiCity,
  normalizeCapiZip,
  normalizePhoneDigits,
  splitPersonName,
} from "./metaCapi.js";

function sha(value) {
  return createHash("sha256").update(value).digest("hex");
}

describe("splitPersonName", () => {
  it("uses profile first + last", () => {
    expect(splitPersonName("Jennifer", "Stone")).toEqual({
      firstName: "Jennifer",
      lastName: "Stone",
    });
  });

  it("drops a middle initial from first name", () => {
    expect(splitPersonName("Jennifer A", "Stone")).toEqual({
      firstName: "Jennifer",
      lastName: "Stone",
    });
  });

  it("splits a Stripe full name when last_name is missing", () => {
    expect(splitPersonName("Jennifer A Stone", "")).toEqual({
      firstName: "Jennifer",
      lastName: "Stone",
    });
  });
});

describe("normalizePhoneDigits", () => {
  it("adds US country code to a 10-digit number", () => {
    expect(normalizePhoneDigits("555-123-4567", "US")).toBe("15551234567");
    expect(normalizePhoneDigits("(555) 123-4567", "")).toBe("15551234567");
  });

  it("does not double-prefix an 11-digit US number", () => {
    expect(normalizePhoneDigits("15551234567", "US")).toBe("15551234567");
  });

  it("omits short numbers", () => {
    expect(normalizePhoneDigits("12345", "US")).toBe("");
  });
});

describe("address normalizers", () => {
  it("strips city punctuation and zip+4", () => {
    expect(normalizeCapiCity("Carlsbad!")).toBe("carlsbad");
    expect(normalizeCapiZip("78732-1234")).toBe("78732");
  });
});

describe("matchFieldsFromProfileAndCheckout", () => {
  it("prefers profile name/phone and Stripe billing address", () => {
    expect(matchFieldsFromProfileAndCheckout(
      {
        email: "jane@example.com",
        profile: { name: "Jennifer", last_name: "Stone", phone: "5551234567" },
      },
      {
        customer_email: "other@example.com",
        customer_details: {
          name: "Jennifer A Stone",
          email: "card@example.com",
          phone: null,
          address: {
            city: null,
            state: null,
            postal_code: "78732",
            country: "US",
          },
        },
      },
    )).toEqual({
      email: "jane@example.com",
      phone: "5551234567",
      firstName: "Jennifer",
      lastName: "Stone",
      city: "",
      state: "",
      zip: "78732",
      country: "US",
    });
  });

  it("falls back to Stripe name when profile names are empty", () => {
    expect(matchFieldsFromProfileAndCheckout(
      { email: null, profile: { name: null, last_name: null, phone: null } },
      {
        customer_details: {
          name: "Jane Doe",
          email: "jane@example.com",
          phone: "+1 555 123 4567",
          address: { city: "Austin", state: "TX", postal_code: "78732", country: "US" },
        },
      },
    )).toEqual({
      email: "jane@example.com",
      phone: "+1 555 123 4567",
      firstName: "Jane",
      lastName: "Doe",
      city: "Austin",
      state: "TX",
      zip: "78732",
      country: "US",
    });
  });
});

describe("buildCapiUserData", () => {
  it("hashes name, phone, and address and omits blanks", async () => {
    const userData = await buildCapiUserData({
      email: "Jane@Example.com",
      firstName: "Jennifer",
      lastName: "Stone",
      phone: "5551234567",
      zip: "78732-0001",
      country: "US",
      fbp: "fb.1.1700000000.1",
      clientIp: "24.55.42.34",
    });

    expect(userData).toEqual({
      em: [sha("jane@example.com")],
      ph: [sha("15551234567")],
      fn: [sha("jennifer")],
      ln: [sha("stone")],
      zp: [sha("78732")],
      country: [sha("us")],
      fbp: "fb.1.1700000000.1",
      client_ip_address: "24.55.42.34",
    });
    expect(userData.ct).toBeUndefined();
    expect(userData.st).toBeUndefined();
    expect(userData.fbc).toBeUndefined();
  });

  it("hashes city and state when Stripe collected them", async () => {
    const userData = await buildCapiUserData({
      city: "Austin",
      state: "TX",
    });
    expect(userData.ct).toEqual([sha("austin")]);
    expect(userData.st).toEqual([sha("tx")]);
  });
});
