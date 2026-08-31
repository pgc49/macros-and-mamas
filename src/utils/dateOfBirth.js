import { localDateIso } from "./dates";

/** Oldest age the DOB picker and validators accept. Covers grandmas (Dolly / 1958). */
export const MAX_PLAUSIBLE_AGE_YEARS = 120;

/**
 * HTML date min/max for intake + profile.
 * Native pickers without `min` often start around ~1960 / last 65 years, which
 * blocks 1958. Floor is today minus 120 years — not a one-off bump to 1958.
 * Max is today (product does not require 18+).
 */
export function birthDateInputBounds(now = new Date()) {
  const today = now instanceof Date ? now : new Date(now);
  const oldest = new Date(
    today.getFullYear() - MAX_PLAUSIBLE_AGE_YEARS,
    today.getMonth(),
    today.getDate(),
  );
  return { min: localDateIso(oldest), max: localDateIso(today) };
}

function isRealCalendarDate(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  const parsed = new Date(y, m - 1, d);
  return (
    parsed.getFullYear() === y
    && parsed.getMonth() === m - 1
    && parsed.getDate() === d
  );
}

/** True when YYYY-MM-DD is a real calendar day between the 120-year floor and today. */
export function isPlausibleDateOfBirth(dob, now = new Date()) {
  if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(String(dob))) return false;
  const iso = String(dob);
  if (!isRealCalendarDate(iso)) return false;
  const { min, max } = birthDateInputBounds(now);
  return iso >= min && iso <= max;
}

/** Age in whole years from YYYY-MM-DD (local), or null if implausible. */
export function ageFromDateOfBirth(dob, now = new Date()) {
  if (!isPlausibleDateOfBirth(dob, now)) return null;
  const [y, m, d] = String(dob).split("-").map(Number);
  const today = now instanceof Date ? now : new Date(now);
  let age = today.getFullYear() - y;
  const md = today.getMonth() - (m - 1);
  if (md < 0 || (md === 0 && today.getDate() < d)) age -= 1;
  return age;
}
