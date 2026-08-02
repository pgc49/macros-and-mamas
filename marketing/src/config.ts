export type EnrollmentMode = 'waitlist' | 'open';

const rawMode = import.meta.env.PUBLIC_ENROLLMENT_MODE ?? 'waitlist';

export const enrollmentMode: EnrollmentMode =
  rawMode === 'open' ? 'open' : 'waitlist';

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

/** Existing checkout / enroll flow in the product app. */
export const enrollUrl = '/join';

export const siteUrl = 'https://www.macrosandmamas.com';

export const offerPrice = isWaitlist ? waitlistPrice : fullPrice;
export const offerAvailability = isWaitlist
  ? 'https://schema.org/PreOrder'
  : 'https://schema.org/LimitedAvailability';
