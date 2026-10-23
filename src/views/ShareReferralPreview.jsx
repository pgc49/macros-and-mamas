import { SharePage } from "./SharePage";

const PREVIEW = {
  code: "PAT25",
  blurb: "Use code PAT25 to join Callie in her Macros and Mamas 8-week transformation program — you'll save $25. www.macrosandmamas.com",
  friendsEnrolled: 1,
  availableCents: 0,
  pendingCents: 2500,
  vestingDays: 3,
  ambassador: false,
};

/** Local-only Share screen: one friend enrolled, $25 pending toward a free month. */
export function ShareReferralPreview() {
  return <SharePage preview={PREVIEW} />;
}
