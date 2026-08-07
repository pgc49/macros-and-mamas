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
/** Later full rate (shown as reference while early $249 is live). */
export const fullPrice = 299;
export const foundingPrice = 149;
/** Public checkout price while enrollment is open at the early rate. */
export const openPrice = waitlistPrice;

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
/** Lead magnet — same origin on marketing host (preview or www after cutover). */
export const quizUrl = '/quiz';

export const offerPrice = isWaitlist ? waitlistPrice : openPrice;
export const offerAvailability = isWaitlist
  ? 'https://schema.org/PreOrder'
  : 'https://schema.org/LimitedAvailability';
