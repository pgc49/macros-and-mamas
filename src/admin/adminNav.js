/** Map legacy ?tab= values onto Home / People / Messages / More. */

export const PRIMARY_TABS = ["home", "people", "messages", "more"];

const LEGACY_TO_PRIMARY = {
  overview: "home",
  home: "home",
  people: "people",
  clients: "people",
  leads: "people",
  messages: "messages",
  more: "more",
  announcements: "more",
  banners: "more",
  emails: "more",
  credits: "more",
  funnel: "more",
  ai: "more",
};

export function primaryTabFromQuery(raw) {
  const q = String(raw || "").trim();
  return LEGACY_TO_PRIMARY[q] || "home";
}

export function peopleSegmentFromQuery(raw) {
  const q = String(raw || "").trim();
  if (q === "leads") return "leads";
  return "clients";
}

export function moreViewFromQuery(raw) {
  const q = String(raw || "").trim();
  if (q === "emails") return "emails";
  if (q === "credits") return "credits";
  if (q === "announcements") return "announcements";
  if (q === "funnel") return "funnel";
  if (q === "ai") return "ai";
  if (q === "banners") return "banners";
  return "menu";
}

export function queryTabFor(primary, { peopleSegment, moreView } = {}) {
  if (primary === "home") return "home";
  if (primary === "messages") return "messages";
  if (primary === "people") {
    if (peopleSegment === "leads") return "leads";
    if (peopleSegment === "clients") return "clients";
    return "people";
  }
  if (moreView && moreView !== "menu") return moreView;
  return "more";
}
