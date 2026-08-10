/* ==================================================================
   Optional copy for the home-screen "App update ready" banner.

   Served by /api/app-version so older home-screen installs can show
   what’s new on the newly deployed build.

   Policy:
   - The reload banner still appears whenever the build id changes.
   - Put bullets here ONLY for significant UI / UX ships.
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
  id: "2026-08-goals-rhythm-v1",
  headline: "What’s new",
  bullets: [
    "Custom goals in your rhythm tracker — add up to 3 of your own (YOURS), plus a clearer Progress tab to see how each habit is going week by week. Shout-out to Sheila for suggesting this!",
    "Group messaging is live in the app — we’re slowly moving group-forum chat off WhatsApp so conversations live in one place. Give it a try!",
    "A new referral system is on the way — Callie will share more about this soon!",
  ],
};
