import { useMemo, useState } from "react";
import { MessagesThread } from "../components/MessagesThread";
import { mergeMessagesById } from "../lib/messageOrdering";
import { MESSAGE_PAGE_SIZE } from "../lib/messageChannels";
import { Fonts } from "../theme/Fonts";
import { T, F, FD } from "../theme/tokens";

/**
 * Local-only preview of the group-thread pin, load-earlier, and jump-to-latest
 * behavior. No network — the fixture stands in for a busy August group.
 */
const SELF = "mama-1";
const PEER = "callie";

function photoDataUrl(label, hue) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400">
    <rect width="640" height="400" fill="hsl(${hue} 42% 72%)"/>
    <text x="32" y="210" font-size="36" font-family="Georgia, serif" fill="#33272e">${label}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function makeMessage(n, extra = {}) {
  const mine = n % 5 === 0;
  return {
    id: `m-${n}`,
    sender_id: mine ? SELF : PEER,
    body: extra.body ?? (mine ? `My note ${n}` : `Group post ${n} — how are we doing this week?`),
    created_at: new Date(Date.UTC(2026, 7, 1, 12, 0, n)).toISOString(),
    reactions: [],
    reaction_rows: [],
    ...extra,
  };
}

function seedWindow() {
  const rows = [];
  for (let n = 61; n <= 100; n += 1) {
    if (n % 8 === 0) {
      rows.push(makeMessage(n, {
        body: "",
        attachment_path: `aug/photo-${n}.jpg`,
        attachment_name: `photo-${n}.jpg`,
        attachment_mime: "image/jpeg",
        attachmentUrl: photoDataUrl(`Photo ${n}`, 20 + n),
      }));
      continue;
    }
    rows.push(makeMessage(n));
  }
  return rows;
}

export function MessagesThreadPreview() {
  const [messages, setMessages] = useState(seedWindow);
  const [hasEarlier, setHasEarlier] = useState(true);
  const [nextOlder, setNextOlder] = useState(60);
  const [nextNewer, setNextNewer] = useState(101);

  const senderNameById = useMemo(() => ({
    [SELF]: "You",
    [PEER]: "Callie",
    mama2: "Jess",
  }), []);

  const loadEarlier = async () => {
    const start = Math.max(1, nextOlder - MESSAGE_PAGE_SIZE + 1);
    const older = [];
    for (let n = start; n <= nextOlder; n += 1) older.push(makeMessage(n));
    setMessages((list) => mergeMessagesById(older, list));
    setNextOlder(start - 1);
    setHasEarlier(start > 1);
  };

  const someonePosted = () => {
    const n = nextNewer;
    setNextNewer(n + 1);
    const row = makeMessage(n, {
      sender_id: "mama2",
      body: `New group post ${n} just landed.`,
    });
    setMessages((list) => mergeMessagesById(list, [row]));
  };

  const send = async (body) => {
    const n = nextNewer;
    setNextNewer(n + 1);
    const row = makeMessage(n, { sender_id: SELF, body });
    setMessages((list) => mergeMessagesById(list, [row]));
  };

  return (
    <div style={{
      maxWidth: 560,
      margin: "0 auto",
      padding: "16px 12px 12px",
      background: T.bg,
      height: "100vh",
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
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
        August Group
      </h1>
      <p style={{ fontSize: 13.5, color: T.inkSoft, margin: "0 0 10px", lineHeight: 1.45 }}>
        Scroll to the newest message and wait — the list should stay pinned
        while photos settle. Scroll up, then tap “Someone else posted” to
        confirm the pane holds. “Load earlier messages” should keep the row
        you were reading.
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexShrink: 0 }}>
        <button
          type="button"
          data-demo-someone-posted
          onClick={someonePosted}
          style={{
            border: `1.5px solid ${T.border}`,
            background: "#fff",
            color: T.accentDeep,
            borderRadius: 999,
            padding: "6px 12px",
            fontFamily: F,
            fontWeight: 800,
            fontSize: 12.5,
            cursor: "pointer",
          }}
        >
          Someone else posted
        </button>
      </div>
      <div style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
      }}
      >
        <MessagesThread
          title=""
          subtitle=""
          messages={messages}
          selfId={SELF}
          threadKey="demo:august"
          peerName="August Group"
          senderNameById={senderNameById}
          showSenderNames
          onSend={send}
          onLoadEarlier={loadEarlier}
          hasEarlier={hasEarlier}
          emptyState="No group messages yet."
          enableReply={false}
          showPushPrompt={false}
        />
      </div>
    </div>
  );
}
