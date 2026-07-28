import { useEffect, useRef, useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { Btn } from "./ui";
import {
  enablePushNotifications,
  isStandaloneDisplay,
  notificationPermission,
  pushSupported,
  registerMessageServiceWorker,
} from "../lib/push";

/**
 * Shared chat thread UI (mama Messages tab + admin per-client thread).
 */
export function MessagesThread({
  title = "Callie",
  subtitle = "Private messages — just you two",
  messages = [],
  selfId,
  busy = false,
  onSend,
  onMarkRead,
  showPushPrompt = false,
  onSavePushSubscription,
}) {
  const [draft, setDraft] = useState("");
  const [pushMsg, setPushMsg] = useState("");
  const [pushBusy, setPushBusy] = useState(false);
  const bottomRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    registerMessageServiceWorker();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    onMarkRead?.();
  }, [messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    const text = draft.trim();
    if (!text || busy || !onSend) return;
    setDraft("");
    try {
      await onSend(text);
    } catch (e) {
      console.error(e);
      setDraft(text);
    }
  };

  const enablePush = async () => {
    setPushBusy(true);
    setPushMsg("");
    try {
      const result = await enablePushNotifications(onSavePushSubscription);
      if (result.ok) setPushMsg("Notifications on — you’ll get a ping for new messages.");
      else if (result.reason === "not_standalone") {
        setPushMsg("Open Macros and Mamas from your Home Screen icon first, then tap again.");
      } else if (result.reason === "denied") {
        setPushMsg("Notifications blocked — enable them in iPhone Settings → Notifications.");
      } else {
        setPushMsg("Push isn’t available on this device — you’ll still get email.");
      }
    } catch (e) {
      console.error(e);
      setPushMsg("Couldn’t turn on notifications — try again.");
    } finally {
      setPushBusy(false);
    }
  };

  const needPushPrompt = showPushPrompt
    && pushSupported()
    && notificationPermission() !== "granted";

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "55vh" }}>
      <div style={{ marginBottom: 10 }}>
        <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "6px 0 2px" }}>{title}</h2>
        <p style={{ fontSize: 13.5, color: T.inkSoft, margin: 0, lineHeight: 1.45 }}>{subtitle}</p>
      </div>

      {needPushPrompt && (
        <div style={{
          background: T.accentSoft,
          borderRadius: 12,
          padding: "12px 14px",
          marginBottom: 12,
        }}
        >
          <div style={{ fontSize: 13.5, color: T.ink, lineHeight: 1.45, marginBottom: 8 }}>
            {isStandaloneDisplay()
              ? "Turn on notifications so you don’t miss Callie when you’re not in the app."
              : "For lock-screen pings, open this app from your Home Screen icon, then enable notifications."}
          </div>
          <Btn small onClick={enablePush} disabled={pushBusy}>
            {pushBusy ? "Working…" : "Turn on notifications"}
          </Btn>
          {pushMsg && (
            <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 8, lineHeight: 1.4 }}>{pushMsg}</div>
          )}
        </div>
      )}
      {!needPushPrompt && pushMsg && (
        <div style={{ fontSize: 12.5, color: "#3E5A46", marginBottom: 10 }}>{pushMsg}</div>
      )}

      <div
        ref={listRef}
        style={{
          flex: 1,
          overflowY: "auto",
          background: "#fff",
          border: `1.5px solid ${T.border}`,
          borderRadius: 14,
          padding: 12,
          minHeight: 280,
          maxHeight: "52vh",
        }}
      >
        {!messages.length && (
          <div style={{ fontSize: 14, color: T.inkSoft, lineHeight: 1.5, padding: "20px 8px", textAlign: "center" }}>
            No messages yet — say hi. Callie will reply here.
          </div>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === selfId;
          return (
            <div
              key={m.id}
              style={{
                display: "flex",
                justifyContent: mine ? "flex-end" : "flex-start",
                marginBottom: 10,
              }}
            >
              <div style={{
                maxWidth: "85%",
                background: mine ? T.accentSoft : T.sageSoft,
                color: T.ink,
                borderRadius: 14,
                padding: "10px 12px",
                fontFamily: F,
                fontSize: 14.5,
                lineHeight: 1.45,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
              >
                {!mine && (
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.accentDeep, marginBottom: 4 }}>
                    Callie
                  </div>
                )}
                {m.body}
                <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 6 }}>
                  {formatMsgTime(m.created_at)}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "flex-end" }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
          rows={2}
          placeholder="Write a message…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          style={{
            flex: 1,
            boxSizing: "border-box",
            padding: "12px 14px",
            borderRadius: 12,
            border: `1.5px solid ${T.border}`,
            fontFamily: F,
            fontSize: 15,
            resize: "none",
            color: T.ink,
            background: "#fff",
          }}
        />
        <Btn onClick={send} disabled={busy || !draft.trim()} style={{ flexShrink: 0 }}>
          {busy ? "…" : "Send"}
        </Btn>
      </div>
    </div>
  );
}

function formatMsgTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}
