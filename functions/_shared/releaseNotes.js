/* ==================================================================
   Optional copy for the home-screen "App update ready" banner.

   Served by /api/app-version so older home-screen installs can show
   what’s new on the newly deployed build.

   Policy:
   - Amber “App update ready” = refresh only (never lists these bullets).
   - Sage “What’s new” = bullets below, shown once after she’s on the
     latest build; Got it persists via localStorage (notes id).
   - Put bullets here ONLY for significant UI / UX ships.
   - For quiet deploys, set bullets: [] so What’s new stays hidden.
   - When you ship new notes, bump `id` so Got it from an older set
     doesn’t suppress the new card.

   Preview:
     ?demoUpdateBanner=1  — “App update ready” (+ notes if any)
     ?demoWhatsNew=1      — post-update “What’s new” card
   ================================================================== */

export const APP_RELEASE_NOTES = {
  id: "2026-08-goals-rhythm-v2",
  headline: "What’s new",
  bullets: [
    "Custom goals in your rhythm tracker — add up to 3 of your own (YOURS), plus a clearer Progress tab to see each habit week by week. Shout-out to Sheila for suggesting this!",
    "Group messaging is in the app — we’re slowly moving the group forum off WhatsApp so conversations live in one place. Give it a try!",
    "A new referral system is on the way — Callie will share more soon!",
    "New recipe: High Protein Einkorn Pancakes",
  ],
};
