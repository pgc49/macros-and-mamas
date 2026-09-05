import { Fonts } from "../theme/Fonts";
import { T, F, FD } from "../theme/tokens";
import { InboxRow } from "./AdminMessages";

function localIso(daysAgo, hour = 10, minute = 51) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/** Local-only inbox list with iMessage-style last-message stamps. */
export function AdminInboxPreview() {
  return (
    <div style={{
      maxWidth: 420,
      margin: "0 auto",
      padding: "20px 12px 48px",
      background: T.bg,
      minHeight: "100vh",
      boxSizing: "border-box",
      fontFamily: F,
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
      <h1 style={{ fontFamily: FD, fontWeight: 400, fontSize: 28, margin: "0 0 12px" }}>
        Inbox timestamps
      </h1>
      <InboxRow
        title="Callie S"
        subtitle="Do you want me to add time stamps on these like iMessage?"
        timestamp={localIso(0)}
        unread={0}
      />
      <InboxRow
        title="August Group"
        subtitle="Congrats Patrick and Callie"
        timestamp={localIso(1, 10, 48)}
        unread={1}
        unreadAsDot
      />
      <InboxRow
        title="Deana"
        subtitle="Logged lunch. Protein felt easy today."
        timestamp={localIso(3, 9, 12)}
        unread={2}
      />
      <InboxRow
        title="Nora Kim"
        subtitle="No messages yet"
        timestamp={localIso(12, 14, 5)}
      />
    </div>
  );
}
