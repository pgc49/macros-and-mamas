import { describe, expect, it } from "vitest";
import {
  fullName,
  joinPersonName,
  nameAlreadyHasLast,
} from "./personName.js";

describe("joinPersonName", () => {
  it("returns first only when last is empty", () => {
    expect(joinPersonName("Sarah", "")).toBe("Sarah");
    expect(joinPersonName("Sarah", "   ")).toBe("Sarah");
    expect(joinPersonName("Sarah", null)).toBe("Sarah");
    expect(joinPersonName("Sarah")).toBe("Sarah");
  });

  it("joins a one-word first name with last (the live majority case)", () => {
    expect(joinPersonName("Sarah", "Smith")).toBe("Sarah Smith");
    expect(joinPersonName("  Sarah  ", "  Smith  ")).toBe("Sarah Smith");
  });

  it("does not append last when name already ends with last_name", () => {
    expect(joinPersonName("Sarah Smith", "Smith")).toBe("Sarah Smith");
    expect(joinPersonName("Sarah SMITH", "smith")).toBe("Sarah SMITH");
    expect(joinPersonName("sarah smith", "SMITH")).toBe("sarah smith");
  });

  it("does not append last when last_name is already the last token", () => {
    expect(nameAlreadyHasLast("Sarah Smith", "Smith")).toBe(true);
    expect(joinPersonName("Mary Ann", "Ann")).toBe("Mary Ann");
  });

  it("does not collapse a name that already has last twice — only skips another append", () => {
    expect(joinPersonName("Sarah Smith Smith", "Smith")).toBe("Sarah Smith Smith");
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
