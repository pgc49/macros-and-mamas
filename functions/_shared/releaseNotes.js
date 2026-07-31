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
    "Snap → Menu — photograph a restaurant menu for up to 5 ranked picks, then tap I ordered this to log.",
    "Update this meal — one box on any logged meal for a plate photo or “also had…” note.",
  ],
};
