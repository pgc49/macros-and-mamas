import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MAX_PLAUSIBLE_AGE_YEARS,
  ageFromDateOfBirth,
  birthDateInputBounds,
  isPlausibleDateOfBirth,
} from "./dateOfBirth.js";

const NOW = new Date(2026, 7, 31); // Aug 31, 2026 — matches agent "today"

describe("birthDateInputBounds", () => {
  it("floors 120 years back so 1958 and 1945 are in the picker", () => {
    const { min, max } = birthDateInputBounds(NOW);
    expect(MAX_PLAUSIBLE_AGE_YEARS).toBe(120);
    expect(min).toBe("1906-08-31");
    expect(max).toBe("2026-08-31");
    expect(min <= "1958-06-15").toBe(true);
    expect(min <= "1945-01-01").toBe(true);
    expect("2026-09-01" > max).toBe(true);
  });
});

describe("isPlausibleDateOfBirth / ageFromDateOfBirth", () => {
  it("treats 1958 as valid (Dolly)", () => {
    expect(isPlausibleDateOfBirth("1958-06-15", NOW)).toBe(true);
    expect(ageFromDateOfBirth("1958-06-15", NOW)).toBe(68);
  });

  it("treats 1945 as valid", () => {
    expect(isPlausibleDateOfBirth("1945-01-01", NOW)).toBe(true);
    expect(ageFromDateOfBirth("1945-01-01", NOW)).toBe(81);
  });

  it("rejects a future date", () => {
    expect(isPlausibleDateOfBirth("2026-09-01", NOW)).toBe(false);
    expect(ageFromDateOfBirth("2026-09-01", NOW)).toBeNull();
  });

  it("rejects a year older than the 120-year floor", () => {
    expect(isPlausibleDateOfBirth("1906-08-30", NOW)).toBe(false);
    expect(ageFromDateOfBirth("1900-01-01", NOW)).toBeNull();
  });

  it("accepts the exact 120-year floor and today", () => {
    expect(isPlausibleDateOfBirth("1906-08-31", NOW)).toBe(true);
    expect(ageFromDateOfBirth("1906-08-31", NOW)).toBe(120);
    expect(isPlausibleDateOfBirth("2026-08-31", NOW)).toBe(true);
    expect(ageFromDateOfBirth("2026-08-31", NOW)).toBe(0);
  });
});

describe("intake + profile wiring", () => {
  it("both date inputs use the shared 120-year min/max helper", () => {
    for (const file of ["src/views/IntakeFlow.jsx", "src/views/ProfilePage.jsx"]) {
      const src = readFileSync(file, "utf8");
      expect(src, file).toContain("birthDateInputBounds");
      expect(src, file).toMatch(/min=\{dobMin\}/);
      expect(src, file).toMatch(/max=\{dobMax\}/);
    }
  });
});
