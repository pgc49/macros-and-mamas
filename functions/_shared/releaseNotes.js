/* ==================================================================
   Optional copy for the home-screen "App update ready" banner.

   Served by /api/app-version so older home-screen installs can show
   what’s new on the newly deployed build.

   Policy:
   - Banner still appears whenever the build id changes (PWA reload).
   - Set headline + bullets only for significant UI / UX ships.
   - Leave notes in place until the next significant ship replaces them
     (tiny fixes can keep the last notable “what’s new”).
   - Clear bullets to [] for a quiet deploy with generic banner copy only.

   Preview the banner (including these notes) on any deploy:
     ?demoUpdateBanner=1
   ================================================================== */

export const APP_RELEASE_NOTES = {
  headline: "What’s new",
  bullets: [
    "Eating out and still want to hit your macros? On Today, open Snap → Menu, photograph the menu, and AI ranks up to 5 dishes that fit what’s left in your day. Tap “I ordered this” on the one you pick to log it.",
    "Once your food arrives, open that meal and add a plate photo (or a quick note) under Update this meal — that tightens the estimate so your log stays closer to what you actually ate.",
  ],
};
