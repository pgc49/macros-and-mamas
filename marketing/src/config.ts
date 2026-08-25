export type EnrollmentMode = 'waitlist' | 'open';

const rawMode = String(import.meta.env.PUBLIC_ENROLLMENT_MODE ?? 'open')
  .trim()
  .toLowerCase();

/** Baked at build from wrangler.toml / PUBLIC_ENROLLMENT_MODE. */
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

/** Pricing-card doors line — soft cap in copy only; no counters or remaining-spot math. */
export const doorsCloseReason =
  `Doors close ${doorsCloseDate}, or when the 50 spots fill · starts ${cohortStartDate}`;

export const queuePositionCopy =
  `Lock your spot and you're in Callie's queue. She builds and approves ranges in the order they come in, so the earlier you're in, the earlier your app opens and the more time you have to get comfortable before ${cohortStartDateCompact}.`;

/** Quiz offer — what happens after she locks her spot (queue promise + password/intake in one beat). */
export const postPayQueueCopy =
  `After you lock your spot, you'll set a password and fill out a short intake. Callie builds ranges in the order they come in, so the earlier you're in, the sooner your app opens.`;

/** Early rate — revealed only after an eligible quiz finish (Strategy A). */
export const waitlistPrice = 249;
/**
 * Public / full rate shown on the homepage before the quiz.
 * Do not present as a former “was” price until it has actually been charged.
 */
export const fullPrice = 299;
export const foundingPrice = 149;
/** Public checkout price when marketing mode is `open` (no quiz gate). */
export const openPrice = fullPrice;
/** Rounded per-week figures for marketing copy. */
export const programWeeks = 8;
export const weeklyPrice = Math.round(waitlistPrice / programWeeks);
export const fullWeeklyPrice = Math.round(fullPrice / programWeeks);

/** Optional Lab Review add-on (pricing section + FAQ). */
export const labAddonPrice = 349;
export const labStandalonePrice = 600;
export const labPanelPrice = 200;

/**
 * Canonical / OG base (always production www).
 * App CTAs below are same-origin relative so SPA preview overlays
 * (cursor-*.macros-and-mamas.pages.dev) stay on the preview host —
 * absolute www URLs were kicking preview testers into production.
 */
export const siteUrl = 'https://www.macrosandmamas.com';
export const enrollUrl = '/join';
export const signInUrl = '/signin';
export const termsUrl = '/terms';
export const privacyUrl = '/privacy';
export const dashboardUrl = '/dashboard';
/** Lead magnet — same origin on marketing host (preview or www after cutover). */
export const quizUrl = '/quiz';

/** Public listed price (schema + open CTAs). Early $249 is quiz-gated. */
export const offerPrice = isWaitlist ? fullPrice : openPrice;
export const offerAvailability = isWaitlist
  ? 'https://schema.org/PreOrder'
  : 'https://schema.org/LimitedAvailability';
