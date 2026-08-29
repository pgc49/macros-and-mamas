import { HomeScreenTip } from "../components/HomeScreenTip";
import { NotificationsTip } from "../components/NotificationsTip";
import { Fonts } from "../theme/Fonts";
import { T, F, FD } from "../theme/tokens";

/** Local-only preview of the Cohort 2 Today getting-started cards. */
export function OnboardingBannersPreview() {
  return (
    <div style={{
      maxWidth: 560,
      margin: "0 auto",
      padding: "24px 16px 40px",
      background: T.bg,
      minHeight: "100vh",
      boxSizing: "border-box",
    }}
    >
      <Fonts />
      <p style={{
        fontFamily: F,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color: T.inkSoft,
        margin: "0 0 6px",
      }}
      >
        Local preview
      </p>
      <h1 style={{
        fontFamily: FD,
        fontWeight: 400,
        fontSize: 26,
        margin: "0 0 8px",
        color: T.ink,
      }}
      >
        Hi Mama.
      </h1>
      <p style={{ fontSize: 14, color: T.inkSoft, margin: "0 0 14px", fontFamily: F }}>
        Cohort 2 Today cards — pin the app, then turn on notifications.
      </p>
      <HomeScreenTip />
      <NotificationsTip cohortLabel="2026-08" />
    </div>
  );
}
