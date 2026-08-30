import { describe, expect, it } from "vitest";
import { fullName } from "./db.js";

describe("fullName", () => {
  it("joins first and last when name is first-only", () => {
    expect(fullName({ name: "Lindsay", last_name: "Luevanos" })).toBe("Lindsay Luevanos");
    expect(fullName({ name: "Callie", lastName: "Chammas" })).toBe("Callie Chammas");
  });

  it("does not double a last name already in name", () => {
    expect(fullName({ name: "Lindsay Luevanos", last_name: "Luevanos" })).toBe("Lindsay Luevanos");
    expect(fullName({ name: "Callie Chammas", last_name: "Chammas" })).toBe("Callie Chammas");
  });

  it("strips an already-doubled last name", () => {
    expect(fullName({ name: "Mallory Shull Shull", last_name: "Shull" })).toBe("Mallory Shull");
    expect(fullName({ name: "Lindsay Luevanos Luevanos", lastName: "Luevanos" })).toBe("Lindsay Luevanos");
  });

  it("uses first_name when name is empty", () => {
    expect(fullName({ first_name: "Megan", last_name: "Wells" })).toBe("Megan Wells");
  });

  it("returns a single field when the other is missing", () => {
    expect(fullName({ name: "Mama" })).toBe("Mama");
    expect(fullName({ last_name: "Wells" })).toBe("Wells");
    expect(fullName(null)).toBe("");
  });
});
