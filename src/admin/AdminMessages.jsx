import { useCallback, useEffect, useMemo, useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { Card, Btn } from "../components/ui";
import { MessagesThread } from "../components/MessagesThread";
import { db, fullName } from "../db/db";
import { supabase } from "../lib/supabase";

/**
 * Admin Messages inbox — list of mama threads + 1:1 reply.
 */
export function AdminMessages({ roster = [], adminUserId, initialClientId = null }) {
  const [inbox, setInbox] = useState([]);
  const [activeId, setActiveId] = useState(initialClientId);
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const clientMap = useMemo(() => {
    const m = new Map();
    for (const c of roster || []) m.set(c.id, c);
    return m;
  }, [roster]);

  const refreshInbox = useCallback(async () => {
    try {
      const rows = await db.loadMessageInbox();
      setInbox(rows);
    } catch (e) {
      console.error(e);
      setError(e.message || "Couldn’t load inbox.");
    }
  }, []);

  const refreshThread = useCallback(async (clientId) => {
    if (!clientId) {
      setMessages([]);
      return;
    }
    try {
      const list = await db.loadMessages(clientId);
      setMessages(list);
    } catch (e) {
      console.error(e);
      setError(e.message || "Couldn’t load thread.");
    }
  }, []);

  useEffect(() => {
    refreshInbox();
  }, [refreshInbox]);

  useEffect(() => {
    if (initialClientId) setActiveId(initialClientId);
  }, [initialClientId]);

  useEffect(() => {
    refreshThread(activeId);
  }, [activeId, refreshThread]);

  useEffect(() => {
    const channel = supabase
      .channel("messages-admin-inbox")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => {
          refreshInbox();
          if (activeId) refreshThread(activeId);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeId, refreshInbox, refreshThread]);

  const activeClient = activeId ? clientMap.get(activeId) : null;
  const activeName = activeClient
    ? (fullName(activeClient) || activeClient.name || "Mama")
    : "Mama";

  const send = async (body) => {
    if (!activeId) return;
    setBusy(true);
    setError("");
    try {
      const row = await db.sendMessage({ clientId: activeId, body });
      setMessages((list) => [...list, row]);
      refreshInbox();
    } catch (e) {
      console.error(e);
      setError(e.message || "Couldn’t send.");
      throw e;
    } finally {
      setBusy(false);
    }
  };

  const markRead = async () => {
    if (!activeId || !adminUserId) return;
    await db.markMessagesRead(activeId, adminUserId);
    refreshInbox();
  };

  // Clients with no messages yet — still allow starting a thread from roster search-ish list
  const startable = (roster || [])
    .filter((c) => String(c.role || "").toLowerCase() !== "admin")
    .filter((c) => c.stage === "active" || c.status === "active")
    .filter((c) => !inbox.some((i) => i.clientId === c.id))
    .slice(0, 40);

  return (
    <div>
      <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 28, margin: "4px 0 6px" }}>Messages</h2>
      <p style={{ fontSize: 14, color: T.inkSoft, margin: "0 0 14px", lineHeight: 1.5 }}>
        1:1 with each mama — same thread she sees under Messages in the app.
      </p>
      {error && <div style={{ fontSize: 13, color: T.amber, marginBottom: 10 }}>{error}</div>}

      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(160px, 280px) 1fr",
        gap: 12,
        alignItems: "start",
      }}
      >
        <Card style={{ padding: 10, maxHeight: "70vh", overflowY: "auto" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.inkSoft, marginBottom: 8, letterSpacing: 0.03 }}>
            Inbox
          </div>
          {!inbox.length && (
            <div style={{ fontSize: 13, color: T.inkSoft, padding: "8px 4px" }}>
              No threads yet — start one below.
            </div>
          )}
          {inbox.map((row) => {
            const c = clientMap.get(row.clientId);
            const name = c ? (fullName(c) || c.name || "Mama") : "Mama";
            const active = activeId === row.clientId;
            return (
              <button
                key={row.clientId}
                type="button"
                onClick={() => setActiveId(row.clientId)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  fontFamily: F,
                  border: "none",
                  borderRadius: 10,
                  padding: "10px 10px",
                  marginBottom: 4,
                  cursor: "pointer",
                  background: active ? T.accentSoft : "transparent",
                  color: T.ink,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{name}</span>
                  {row.unread > 0 && (
                    <span style={{
                      background: T.accent,
                      color: "#fff",
                      fontSize: 11,
                      fontWeight: 700,
                      borderRadius: 99,
                      padding: "2px 7px",
                      minWidth: 18,
                      textAlign: "center",
                    }}
                    >
                      {row.unread}
                    </span>
                  )}
                </div>
                <div style={{
                  fontSize: 12.5,
                  color: T.inkSoft,
                  marginTop: 3,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                >
                  {row.lastMessage?.body || ""}
                </div>
              </button>
            );
          })}

          {startable.length > 0 && (
            <>
              <div style={{
                fontSize: 12,
                fontWeight: 700,
                color: T.inkSoft,
                margin: "14px 0 8px",
                letterSpacing: 0.03,
              }}
              >
                Start a thread
              </div>
              {startable.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveId(c.id)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    fontFamily: F,
                    border: `1px dashed ${T.border}`,
                    borderRadius: 10,
                    padding: "8px 10px",
                    marginBottom: 4,
                    cursor: "pointer",
                    background: "#fff",
                    color: T.inkSoft,
                    fontSize: 13.5,
                  }}
                >
                  {fullName(c) || c.name || "Mama"}
                </button>
              ))}
            </>
          )}
        </Card>

        <Card style={{ padding: 14 }}>
          {!activeId ? (
            <div style={{ fontSize: 14, color: T.inkSoft, padding: 20, textAlign: "center" }}>
              Pick a mama to read or reply.
            </div>
          ) : (
            <MessagesThread
              title={activeName}
              subtitle={activeClient?.email || "Private 1:1"}
              messages={messages}
              selfId={adminUserId}
              busy={busy}
              onSend={send}
              onMarkRead={markRead}
              showPushPrompt
              onSavePushSubscription={(sub) => db.savePushSubscription(sub)}
            />
          )}
          {activeId && (
            <div style={{ marginTop: 8 }}>
              <Btn
                small
                ghost
                onClick={() => {
                  setActiveId(null);
                  setMessages([]);
                }}
              >
                Close thread
              </Btn>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
