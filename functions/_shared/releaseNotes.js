/* ==================================================================
   Optional copy for the home-screen "App update ready" banner.

   Served by /api/app-version so older home-screen installs can show
   what’s new on the newly deployed build.

   Policy:
   - Before merging to main, ASK whether this ship needs banner notes.
   - The reload banner still appears whenever the build id changes.
   - Put bullets here ONLY for significant UI / UX ships (mom-friendly why + how).
   - For small / quiet deploys, set bullets: [] so the banner is just
     “App update ready” with no What’s new section.
   - Do not leave old feature notes sitting around — they resurface on
     every later update until cleared or replaced.
   - When you do ship notes, bump `id` so “You’re up to date” can show
     once to people who already refreshed.

   Preview:
     ?demoUpdateBanner=1  — “App update ready” (+ notes if any)
     ?demoWhatsNew=1      — post-update “What’s new” card
   ================================================================== */

export const APP_RELEASE_NOTES = {
  id: "",
  headline: "What’s new",
  // Quiet deploy — no feature notes until the next significant UI ship.
  bullets: [],
};
