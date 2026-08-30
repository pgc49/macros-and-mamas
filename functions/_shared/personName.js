/**
 * Person-name display join.
 *
 * After 020_profile_last_name, `profiles.name` is first-name-only and
 * `last_name` is last-name-only. Some in-memory roster objects (and a
 * few rows) still carry a full name in `name`. Joining blindly produced
 * "Sarah Smith Smith".
 *
 * Do not rewrite stored first names. Almost every live row is already
 * one-word first + last_name. Only skip the extra append when it would
 * double: `name` already ends with last_name, or last_name is already
 * the last token of `name`.
 */

function trimPart(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return value.toLowerCase();
}

/** True when appending `last` would repeat a last name already in `first`. */
export function nameAlreadyHasLast(first, last) {
  const given = trimPart(first);
  const family = trimPart(last);
  if (!given || !family) return false;
  const givenLower = lower(given);
  const familyLower = lower(family);
  if (givenLower === familyLower) return true;
  if (givenLower.endsWith(` ${familyLower}`)) return true;
  const tokens = given.split(/\s+/).filter(Boolean);
  const lastToken = tokens[tokens.length - 1] || "";
  return lower(lastToken) === familyLower;
}

/**
 * Display name: "First Last" without appending last when `first`
 * already ends with that last name or already has it as the last token.
 */
export function joinPersonName(first, last) {
  const given = trimPart(first);
  const family = trimPart(last);
  if (!family) return given;
  if (!given) return family;
  if (nameAlreadyHasLast(given, family)) return given;
  return `${given} ${family}`;
}

/** `fullName()`-shaped objects: name/first_name + lastName/last_name. */
export function fullName(profileOrRow) {
  if (!profileOrRow) return "";
  return joinPersonName(
    profileOrRow.name || profileOrRow.first_name || "",
    profileOrRow.lastName || profileOrRow.last_name || "",
  );
}
