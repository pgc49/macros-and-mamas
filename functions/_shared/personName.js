/**
 * Person-name join / write helpers.
 *
 * After 020_profile_last_name, `profiles.name` is first-name-only and
 * `last_name` is last-name-only. Some rows (and some in-memory roster
 * objects) still carry a full name in `name`. Joining blindly produced
 * "Sarah Smith Smith".
 */

function trimPart(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return value.toLowerCase();
}

/**
 * Peel trailing last-name suffixes off `first`.
 * Requires a space before the suffix so "Annabelle" + "Belle" is left alone.
 * A single-token name that equals last is kept ("Smith" / "Smith").
 */
function stripTrailingLasts(first, last) {
  const family = trimPart(last);
  let given = trimPart(first);
  let count = 0;
  if (!given || !family) return { given, family, count };
  const familyLower = lower(family);
  while (true) {
    const gLower = lower(given);
    if (gLower === familyLower) break;
    if (!gLower.endsWith(` ${familyLower}`)) break;
    given = given.slice(0, given.length - family.length).trim();
    count += 1;
  }
  return { given, family, count };
}

/** Strip every trailing last-name suffix. Used for first-name-only writes. */
export function collapseTrailingLast(first, last) {
  return stripTrailingLasts(first, last).given;
}

/**
 * Display name: "First Last" without appending last when `first`
 * already ends with that last name (case-insensitive, trimmed).
 * Extra trailing lasts already stored in `first` are collapsed so
 * display never shows the last name twice. Original last-name
 * casing in `first` is kept when last was already present.
 */
export function joinPersonName(first, last) {
  const rawGiven = trimPart(first);
  const { given, family, count } = stripTrailingLasts(first, last);
  if (!family) return rawGiven;
  if (!rawGiven) return family;
  if (count === 0) {
    if (lower(given) === lower(family)) return rawGiven;
    return `${given} ${family}`;
  }
  const originalLast = rawGiven.slice(rawGiven.length - family.length);
  if (!given) return originalLast;
  return `${given} ${originalLast}`;
}

/**
 * Persist first-name-only. If `name` already ends with `last_name`,
 * strip that suffix. Empty last leaves `name` unchanged.
 */
export function givenNameForWrite(first, last) {
  const given = trimPart(first);
  const family = trimPart(last);
  if (!given) return "";
  if (!family) return given;
  return collapseTrailingLast(given, family) || given;
}

/** `fullName()`-shaped objects: name/first_name + lastName/last_name. */
export function fullName(profileOrRow) {
  if (!profileOrRow) return "";
  return joinPersonName(
    profileOrRow.name || profileOrRow.first_name || "",
    profileOrRow.lastName || profileOrRow.last_name || "",
  );
}
