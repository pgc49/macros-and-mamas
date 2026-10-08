/** Short tip id testers can match to a preview. */
export const COACH_BUILD = (
  (typeof import.meta !== "undefined" && import.meta.env && (import.meta.env.VITE_COACH_BUILD || import.meta.env.CF_PAGES_COMMIT_SHA))
  || "a765"
).toString().slice(0, 7);
