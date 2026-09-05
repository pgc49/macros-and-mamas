import { AUGUST_COHORT_LABEL } from "./cohorts";

/**
 * Catalog of cards that can appear at the top of Today.
 * Order matches ClientApp render order.
 */
export const TODAY_BANNERS = [
  {
    id: "updateReady",
    title: "App update ready",
    tone: "amber",
    automated: true,
    newUsers: "No — only when her home-screen app is behind production.",
    who: "Mamas (and admin) whose installed JS build id does not match /api/app-version.",
    trigger: "Home-screen / PWA is on an older deploy. Checked on Today load, when the tab becomes visible, and every 5 minutes.",
    hidesWhen: "She taps Update (hard refresh) or Later (hidden for this session + this build id).",
    callieControls: "None. Shipping a new production build is the trigger.",
  },
  {
    id: "whatsNew",
    title: "You’re up to date / What’s new",
    tone: "sage",
    automated: true,
    newUsers: "Yes on a new browser if production currently has release notes — Got it is stored on that device only.",
    who: "Anyone already on the latest build who has not tapped Got it for the current notes id.",
    trigger: "functions/_shared/releaseNotes.js has bullets and a new id. Quiet deploys use bullets: [] so this stays hidden.",
    hidesWhen: "Got it writes localStorage (mm_release_notes_seen = notes id). Bump the id when you ship a new set.",
    callieControls: "Patrick / ship notes in releaseNotes.js. Not an admin toggle.",
  },
  {
    id: "voiceDrop",
    title: "Monday voice drop",
    tone: "accent",
    automated: false,
    newUsers: "Yes if a drop is live for her audience the first time she opens Today.",
    who: "Mamas who match the drop’s audience (Founding, Cohort 2 / August Group, all mamas, or admins-only).",
    trigger: "Callie publishes a drop on Announcements (or Home). It stays until it expires.",
    hidesWhen: "She taps × (remembered per drop id). Next week’s drop uses a new id so it comes back.",
    callieControls: "Announcements → Monday voice drop.",
  },
  {
    id: "homescreen",
    title: "Pin to home screen",
    tone: "accent",
    automated: true,
    newUsers: "Yes — this is the main first-week card for anyone still in Safari/Chrome.",
    who: "Any enrolled mama who is not already opening from the home-screen icon.",
    trigger: "Automatic on Today. No cohort gate. No admin button.",
    hidesWhen: "She taps Got it / × (device + account), or she opens the app from the home-screen icon (we remember that).",
    callieControls: "None.",
  },
  {
    id: "notifications",
    title: "Turn on notifications",
    tone: "accent",
    automated: true,
    newUsers: `Yes for Cohort 2 (${AUGUST_COHORT_LABEL} / August Group) only. Founding does not see this.`,
    who: "Cohort 2 mamas who have not allowed notifications and have not dismissed the card.",
    trigger: "Automatic on Today when cohort_label is 2026-08.",
    hidesWhen: "Got it / × (this device), or the browser already has notification permission granted.",
    callieControls: "None. Founding was skipped on purpose — they already saw the first-week cards.",
  },
];

export function todayBannerIds() {
  return TODAY_BANNERS.map((b) => b.id);
}

/** True when a brand-new mama on a new device can see this card. */
export function bannerCanGreetNewUser(id) {
  const row = TODAY_BANNERS.find((b) => b.id === id);
  if (!row) return false;
  return String(row.newUsers || "").toLowerCase().startsWith("yes");
}
