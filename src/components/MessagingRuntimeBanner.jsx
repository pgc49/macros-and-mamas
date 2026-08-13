import { T, F } from "../theme/tokens";

export function MessagingRuntimeBanner({ runtime }) {
  if (!runtime) return null;
  const paused = runtime.mode !== "normal";
  const attachmentPause = !runtime.attachmentsEnabled;
  const notificationPause = !runtime.notificationsEnabled;
  if (!paused && !attachmentPause && !notificationPause) return null;

  const title = runtime.mode === "off"
    ? "Messaging is temporarily paused"
    : runtime.mode === "read_only"
      ? "Messages are read-only right now"
      : "Messaging maintenance";
  const details = [
    runtime.reason,
    attachmentPause && !paused ? "Attachments are temporarily paused." : "",
    notificationPause ? "Push/email delivery is paused; messages remain in the app." : "",
  ].filter(Boolean).join(" ");

  return (
    <div style={{
      background: paused ? T.amberSoft : T.track,
      border: `1px solid ${T.border}`,
      borderRadius: 12,
      padding: "10px 12px",
      marginBottom: 10,
      fontFamily: F,
      color: T.ink,
      fontSize: 13.5,
      lineHeight: 1.45,
    }}
    >
      <div style={{ fontWeight: 700 }}>{title}</div>
      {details ? <div style={{ color: T.inkSoft, marginTop: 2 }}>{details}</div> : null}
      {paused ? (
        <div style={{ color: T.inkSoft, marginTop: 2 }}>
          Your existing conversations remain available.
        </div>
      ) : null}
    </div>
  );
}

