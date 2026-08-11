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
  id: "2026-08-meals-mama-feedback",
  headline: "What’s new — mama requests",
  bullets: [
    "Pick Breakfast, Lunch, Dinner, or Snack when adding from My plan — thanks Laura!",
    "Edit servings right on Today’s log (no delete + re-add) — thanks Laura!",
    "See and save recipe notes on My meals — thanks Jenna!",
    "New from Callie: Chicken Soba Stir Fry in the dinner recipes.",
  ],
};
