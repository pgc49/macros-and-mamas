import { describe, expect, it } from "vitest";
import {
  collapseTrailingLast,
  fullName,
  givenNameForWrite,
  joinPersonName,
} from "./personName.js";

describe("joinPersonName", () => {
  it("returns first only when last is empty", () => {
    expect(joinPersonName("Sarah", "")).toBe("Sarah");
    expect(joinPersonName("Sarah", "   ")).toBe("Sarah");
    expect(joinPersonName("Sarah", null)).toBe("Sarah");
    expect(joinPersonName("Sarah")).toBe("Sarah");
  });

  it("joins first + last", () => {
    expect(joinPersonName("Sarah", "Smith")).toBe("Sarah Smith");
    expect(joinPersonName("  Sarah  ", "  Smith  ")).toBe("Sarah Smith");
  });

  it("does not append last when name already ends with last_name", () => {
    expect(joinPersonName("Sarah Smith", "Smith")).toBe("Sarah Smith");
    expect(joinPersonName("Sarah SMITH", "smith")).toBe("Sarah SMITH");
    expect(joinPersonName("sarah smith", "SMITH")).toBe("sarah smith");
  });

  it("collapses a last name that was already doubled in name", () => {
    expect(joinPersonName("Sarah Smith Smith", "Smith")).toBe("Sarah Smith");
  });

  it("keeps hyphenated last names intact and does not double them", () => {
    expect(joinPersonName("Sarah", "Smith-Jones")).toBe("Sarah Smith-Jones");
    expect(joinPersonName("Sarah Smith-Jones", "Smith-Jones")).toBe("Sarah Smith-Jones");
    expect(joinPersonName("Sarah Smith-Jones", "smith-jones")).toBe("Sarah Smith-Jones");
  });

  it("keeps multi-word last names intact and does not double them", () => {
    expect(joinPersonName("Sarah", "Van Der Berg")).toBe("Sarah Van Der Berg");
    expect(joinPersonName("Sarah Van Der Berg", "Van Der Berg")).toBe("Sarah Van Der Berg");
    expect(joinPersonName("Sarah van der berg", "Van Der Berg")).toBe("Sarah van der berg");
  });

  it("does not treat a first name that merely ends with last as a match", () => {
    expect(joinPersonName("Annabelle", "Belle")).toBe("Annabelle Belle");
  });

  it("returns last only when first is empty", () => {
    expect(joinPersonName("", "Smith")).toBe("Smith");
    expect(joinPersonName(null, "Smith")).toBe("Smith");
  });

  it("returns empty when both parts are empty", () => {
    expect(joinPersonName("", "")).toBe("");
    expect(joinPersonName(null, undefined)).toBe("");
  });

  it("does not wipe a single-token name that equals last", () => {
    expect(joinPersonName("Smith", "Smith")).toBe("Smith");
  });
});

describe("fullName", () => {
  it("reads name / lastName and first_name / last_name", () => {
    expect(fullName({ name: "Sarah", lastName: "Smith" })).toBe("Sarah Smith");
    expect(fullName({ first_name: "Sarah", last_name: "Smith" })).toBe("Sarah Smith");
    expect(fullName({ name: "Sarah Smith", last_name: "Smith" })).toBe("Sarah Smith");
    expect(fullName(null)).toBe("");
  });

  it("does not re-append last on a roster row whose name is already joined", () => {
    expect(fullName({ name: "Sarah Smith", lastName: "Smith", firstName: "Sarah" }))
      .toBe("Sarah Smith");
  });
});

describe("givenNameForWrite", () => {
  it("keeps a first-name-only value", () => {
    expect(givenNameForWrite("Sarah", "Smith")).toBe("Sarah");
    expect(givenNameForWrite("Sarah", "")).toBe("Sarah");
  });

  it("strips a trailing last name from a full name in the first-name field", () => {
    expect(givenNameForWrite("Sarah Smith", "Smith")).toBe("Sarah");
    expect(givenNameForWrite("Sarah Smith-Jones", "Smith-Jones")).toBe("Sarah");
    expect(givenNameForWrite("Sarah Van Der Berg", "Van Der Berg")).toBe("Sarah");
  });

  it("strips a doubled trailing last name", () => {
    expect(givenNameForWrite("Sarah Smith Smith", "Smith")).toBe("Sarah");
  });

  it("does not rewrite when last is empty", () => {
    expect(givenNameForWrite("Sarah Smith", "")).toBe("Sarah Smith");
  });

  it("does not wipe a single-token name that equals last", () => {
    expect(givenNameForWrite("Smith", "Smith")).toBe("Smith");
  });
});

describe("collapseTrailingLast", () => {
  it("requires a space before the last-name suffix", () => {
    expect(collapseTrailingLast("Annabelle", "Belle")).toBe("Annabelle");
  });
});
