export type EnrollmentMode = 'waitlist' | 'open';

const rawMode = import.meta.env.PUBLIC_ENROLLMENT_MODE ?? 'open';

export const enrollmentMode: EnrollmentMode =
  rawMode === 'waitlist' ? 'waitlist' : 'open';

export const isWaitlist = enrollmentMode === 'waitlist';
export const isOpen = enrollmentMode === 'open';

/** Centralized cohort dates and prices. One-line edits propagate everywhere. */
export const cohortStartDate = 'Monday, Aug 31';
export const cohortStartDateShort = 'August 31';
/** Compact start date for sticky bar / short UI strings. */
export const cohortStartDateCompact = 'Aug 31';
export const doorsCloseDate = 'Aug 27';

export const waitlistPrice = 249;
export const fullPrice = 299;
export const foundingPrice = 149;

/** Optional Lab Review add-on (pricing section + FAQ). */
export const labAddonPrice = 299;
export const labStandalonePrice = 600;
export const labPanelPrice = 200;

/**
 * Absolute product-app URLs so marketing *.pages.dev previews can click
 * through to www without DNS cutover. At www cutover these still work.
 */
export const siteUrl = 'https://www.macrosandmamas.com';
export const enrollUrl = `${siteUrl}/join`;
export const signInUrl = `${siteUrl}/signin`;
export const termsUrl = `${siteUrl}/terms`;
export const privacyUrl = `${siteUrl}/privacy`;
export const dashboardUrl = `${siteUrl}/dashboard`;

export const offerPrice = isWaitlist ? waitlistPrice : fullPrice;
export const offerAvailability = isWaitlist
  ? 'https://schema.org/PreOrder'
  : 'https://schema.org/LimitedAvailability';
