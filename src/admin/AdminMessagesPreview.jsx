import { useState } from "react";
import { Shell } from "../components/ui";
import { MessagesThread } from "../components/MessagesThread";
import { T, F, FD } from "../theme/tokens";
import { AdminBottomNav } from "./AdminBottomNav";

/**
 * Local-only preview of admin Messages chrome: compact tab bar + composer
 * pinned to leftover Shell height. No network.
 */
const SELF = "admin-1";
const PEER = "callie-1";

const FIXTURE = [
  {
    id: "m1",
    sender_id: PEER,
    body: "Hi — just checking in on ranges this week.",
    created_at: "2026-08-10T16:23:00.000Z",
    read_at: "2026-08-10T16:24:00.000Z",
    reactions: [],
  },
  {
    id: "m2",
    sender_id: SELF,
    body: "You’ve got this. Keep living in the bands.",
    created_at: "2026-08-10T16:25:00.000Z",
    read_at: "2026-08-10T16:26:00.000Z",
    reactions: [],
  },
  {
    id: "m3",
    sender_id: PEER,
    body: "Logged lunch. Protein felt easy today.",
    created_at: "2026-09-05T15:25:00.000Z",
    reactions: [],
  },
];

export function AdminMessagesPreview() {
  const [tab, setTab] = useState("messages");
  const [composerFocused, setComposerFocused] = useState(false);
  const [messages, setMessages] = useState(FIXTURE);

  const send = async (body) => {
    setMessages((list) => [
      ...list,
      {
        id: `local-${Date.now()}`,
        sender_id: SELF,
        body,
        created_at: new Date().toISOString(),
        reactions: [],
      },
    ]);
  };

  return (
    <Shell
      bottomBar={<AdminBottomNav tab={tab} setTab={setTab} unreadMessages={12} />}
      hideBottomBar={tab === "messages" && composerFocused}
      lockContentScroll={tab === "messages"}
    >
      <div
        data-admin-messages-slot
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          data-admin-thread-pane
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minHeight: 0,
            height: "100%",
            background: "#fff",
            border: `1.5px solid ${T.border}`,
            borderRadius: 16,
            overflow: "hidden",
          }}
        >
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 12px",
            borderBottom: `1px solid ${T.border}`,
            flexShrink: 0,
          }}
          >
            <span style={{
              color: T.accent,
              fontWeight: 700,
              fontFamily: F,
              fontSize: 15,
            }}
            >
              ← Inbox
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontFamily: FD, fontSize: 20, lineHeight: 1.2 }}>
                Callie Chammas
              </div>
              <div style={{ fontSize: 12.5, color: T.inkSoft }}>
                calista@nourishwithcalista.com · test thread
              </div>
            </div>
          </div>
          <div style={{
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            padding: "10px 12px 12px",
            display: "flex",
            flexDirection: "column",
          }}
          >
            <MessagesThread
              title=""
              subtitle=""
              messages={messages}
              selfId={SELF}
              threadKey="demo:admin-thread"
              peerName="Callie"
              showReadReceipts
              allowVoiceMemo
              enableReply
              showPushPrompt={false}
              onSend={send}
              onComposerFocusChange={setComposerFocused}
              compact
            />
          </div>
        </div>
      </div>
    </Shell>
  );
}
