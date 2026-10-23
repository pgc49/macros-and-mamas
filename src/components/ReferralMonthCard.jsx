import { Link } from "react-router-dom";
import { T, FD, F } from "../theme/tokens";
import { Card } from "./ui";
import { PATHS } from "../lib/appPaths";
import { referralNudgeCopy } from "../lib/referralMembership";

/**
 * Today nudge: refer women to the 8-week program.
 * Two paid referrals cover one month of the $49 membership. Credits stack.
 * Sits outside the paywall pause so the Share link stays tappable.
 */
export function ReferralMonthCard() {
  const copy = referralNudgeCopy();
  return (
    <div data-referral-month="true">
    <Card
      style={{
        margin: "0 0 14px",
        background: T.amberSoft,
        border: "1px solid #E7D3AE",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#7A5416" }}>
        {copy.eyebrow}
      </div>
      <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 24, margin: "8px 0 8px", color: T.ink }}>
        {copy.title}
      </h2>
      <p style={{ fontSize: 15, color: T.ink, lineHeight: 1.55, margin: "0 0 10px" }}>
        {copy.lead}
      </p>
      <p style={{ fontSize: 15, color: T.ink, lineHeight: 1.55, margin: "0 0 14px" }}>
        {copy.stack}
      </p>
      <Link
        to={PATHS.accountShare}
        style={{
          display: "block",
          width: "100%",
          boxSizing: "border-box",
          textAlign: "center",
          textDecoration: "none",
          fontFamily: F,
          fontWeight: 700,
          fontSize: 15,
          padding: "13px 22px",
          borderRadius: 999,
          border: `1.5px solid ${T.accent}`,
          background: "#fff",
          color: T.accent,
        }}
      >
        {copy.action}
      </Link>
      <div style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.45, marginTop: 10 }}>
        {copy.fine}
      </div>
    </Card>
    </div>
  );
}
