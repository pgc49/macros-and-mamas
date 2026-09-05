import { T, F, FD } from "../theme/tokens";
import { Card } from "../components/ui";
import { AppUpdateBanner } from "../components/AppUpdateBanner";
import { MondayVoiceDropBanner } from "../components/MondayVoiceDropBanner";
import { HomeScreenTip } from "../components/HomeScreenTip";
import { NotificationsTip } from "../components/NotificationsTip";
import { TODAY_BANNERS } from "../lib/todayBanners";
import { APP_RELEASE_NOTES } from "../../functions/_shared/releaseNotes.js";
import { AUGUST_COHORT_LABEL } from "../lib/cohorts";

const PREVIEW_VOICE = {
  id: "admin-preview-voice-drop",
  caption: "Preview — this is the Today card when a Monday drop is live.",
  durationMs: 9 * 60 * 1000 + 29 * 1000,
};

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{
        fontSize: 11.5,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color: T.inkSoft,
        marginBottom: 3,
        fontFamily: F,
      }}
      >
        {label}
      </div>
      <div style={{ fontSize: 13.5, lineHeight: 1.45, color: T.ink, fontFamily: F }}>
        {children}
      </div>
    </div>
  );
}

function BannerPreview({ id }) {
  if (id === "updateReady") return <AppUpdateBanner previewMode="update" />;
  if (id === "whatsNew") {
    return (
      <AppUpdateBanner
        previewMode="whatsNew"
        previewNotes={APP_RELEASE_NOTES}
      />
    );
  }
  if (id === "voiceDrop") return <MondayVoiceDropBanner previewDrop={PREVIEW_VOICE} />;
  if (id === "homescreen") return <HomeScreenTip forceVisible />;
  if (id === "notifications") {
    return <NotificationsTip cohortLabel={AUGUST_COHORT_LABEL} forceVisible />;
  }
  return null;
}

/**
 * Coach catalog of Today cards — live preview + who sees each one.
 */
export function AdminTodayBanners() {
  return (
    <div>
      <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 28, margin: "4px 0 6px" }}>
        Today banners
      </h2>
      <p style={{ fontSize: 14, color: T.inkSoft, margin: "0 0 16px", lineHeight: 1.5 }}>
        These stack at the top of a mama&apos;s Today tab, in this order.
        Pin-to-home-screen and the Cohort 2 notifications card are automatic for
        new users. What&apos;s new is automatic when we ship notes.
        The voice drop only appears after you publish one.
        Got it / × on a preview here does not change a mama&apos;s device.
      </p>

      {TODAY_BANNERS.map((row) => (
        <Card key={row.id} style={{ marginBottom: 16 }} data-banner-catalog={row.id}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", marginBottom: 8 }}>
            <div style={{ fontFamily: FD, fontSize: 20 }}>{row.title}</div>
            <span style={{
              fontSize: 11.5,
              fontWeight: 700,
              color: row.automated ? T.sage : T.accentDeep,
              whiteSpace: "nowrap",
            }}
            >
              {row.automated ? "Automatic" : "Callie publishes"}
            </span>
          </div>
          <Field label="New users">{row.newUsers}</Field>
          <Field label="Who sees it">{row.who}</Field>
          <Field label="Trigger">{row.trigger}</Field>
          <Field label="Hides when">{row.hidesWhen}</Field>
          <Field label="Callie controls">{row.callieControls}</Field>
          <div style={{
            fontSize: 11.5,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: T.inkSoft,
            margin: "14px 0 8px",
            fontFamily: F,
          }}
          >
            Mama preview
          </div>
          {row.id === "whatsNew" && !APP_RELEASE_NOTES?.bullets?.length ? (
            <p style={{ fontSize: 13, color: T.inkSoft, margin: "0 0 8px", fontFamily: F }}>
              Quiet deploy right now — What’s new is hidden until we ship notes in releaseNotes.js.
            </p>
          ) : null}
          <BannerPreview id={row.id} />
        </Card>
      ))}
    </div>
  );
}
