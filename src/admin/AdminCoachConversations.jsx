/**
 * Admin-only read of a mama's Meal Coach thread.
 * Access is enforced by coach_messages RLS (is_admin() or own visible rows).
 */
import { useEffect, useMemo, useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { COACH_COPY } from "../content/coachVoice";
import { Card } from "../components/ui";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { db } from "../db/db";
import { formatLongDay } from "../utils/dates";
import {
  buildAdminCoachView,
  coachDisplayDate,
  deflectLine,
  flagLabel,
  plainCoachPlates,
} from "./adminCoachThread";

function formatWhen(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const FLAG_TONE = {
  stuck: { bg: T.amberSoft, color: T.amber },
  medical: { bg: T.amberSoft, color: T.amber },
  deflect: { bg: T.accentSoft, color: T.accentDeep },
};

function FlagChip({ flag }) {
  const tone = FLAG_TONE[flag] || FLAG_TONE.deflect;
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        padding: "3px 8px",
        borderRadius: 99,
        background: tone.bg,
        color: tone.color,
      }}
    >
      {flagLabel(flag)}
    </span>
  );
}

function ChatBubble({ message }) {
  const mine = message.role === "mama";
  const plates = plainCoachPlates(message.payload);
  const deflect = message.kind === "deflect" || message.payload?.deflect;
  return (
    <div
      data-coach-admin-msg={message.id}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: mine ? "flex-end" : "flex-start",
      }}
    >
      <div
        style={{
          maxWidth: "92%",
          background: mine ? T.accentSoft : "#fff",
          border: mine ? "none" : `1px solid ${T.border}`,
          borderRadius: mine ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
          padding: "10px 13px",
        }}
      >
        <div style={{ fontSize: 11.5, fontWeight: 700, color: T.inkSoft, marginBottom: 4 }}>
          {mine ? "Mama" : "Coach"}
          {message.hiddenAt ? " · removed by her" : ""}
          {!mine && message.source === "client" ? " · unverified" : ""}
        </div>
        {message.body ? (
          <div style={{ fontSize: 14, lineHeight: 1.5, color: T.ink }}>{message.body}</div>
        ) : null}
        {deflect && !message.body ? (
          <div style={{ fontSize: 14, lineHeight: 1.5, color: T.ink }}>{deflectLine(message)}</div>
        ) : null}
        {plates.map((plate) => (
          <div key={`${message.id}-${plate.name}`} style={{ marginTop: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{plate.name}</div>
            {plate.fromSaved ? (
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.3, color: T.inkSoft, marginTop: 2 }}>
                {COACH_COPY.adminSavedMeal}
              </div>
            ) : null}
            <div style={{ fontSize: 12.5, color: T.inkSoft }}>{plate.macros}</div>
            {plate.reason ? (
              <div style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.45, marginTop: 2 }}>
                {plate.reason}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 3 }}>
        {coachDisplayDate(message) ? formatLongDay(coachDisplayDate(message)) : ""}
        {message.createdAt ? ` · ${formatWhen(message.createdAt)}` : ""}
      </div>
    </div>
  );
}

export function AdminCoachConversations({ client }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const firstName = String(client?.name || "her").split(" ")[0];

  useEffect(() => {
    if (!client?.id) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    db.loadClientCoachThread(client.id)
      .then((rows) => {
        if (!cancelled) setMessages(rows || []);
      })
      .catch((e) => {
        console.error("loadClientCoachThread failed", e);
        if (!cancelled) {
          setMessages([]);
          setError("Could not load her Coach chats.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [client?.id]);

  const view = useMemo(() => buildAdminCoachView(messages), [messages]);

  return (
    <ErrorBoundary
      name="AdminCoachConversations"
      title="Coach conversations couldn’t load"
      message="Her Coach chats hit a snag. The rest of her day is still here — refresh to try this section again."
      resetKeys={[client?.id]}
    >
    <div style={{ marginTop: 12 }} data-admin-coach-conversations>
      <Card>
        <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 4 }}>
          Coach conversations
        </div>
        <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.55, marginBottom: 12 }}>
          What the Meal Coach told {firstName}, newest first. Read-only — same chats she sees,
          including anything she removed.
        </div>

        {error && (
          <div style={{ fontSize: 13.5, color: T.amber, marginBottom: 10 }}>{error}</div>
        )}
        {loading && (
          <div style={{ fontSize: 13.5, color: T.inkSoft, marginBottom: 10 }}>
            Loading her Coach chats…
          </div>
        )}

        {!loading && !messages.length && !error && (
          <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.55 }}>
            No Coach chats yet.
          </div>
        )}

        {view.pinned.length > 0 && (
          <div data-coach-admin-flags style={{ marginBottom: 14 }}>
            <div
              style={{
                fontFamily: F,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                color: T.amber,
                marginBottom: 8,
              }}
            >
              Needs you
            </div>
            {view.pinned.map((item) => (
              <div
                key={`flag-${item.id}`}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: T.amberSoft,
                  marginBottom: 8,
                }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                  <FlagChip flag={item.flag} />
                  <span style={{ fontSize: 12, color: T.inkSoft }}>{formatWhen(item.createdAt)}</span>
                </div>
                {item.asked ? (
                  <div style={{ fontSize: 13.5, color: T.ink, lineHeight: 1.45 }}>
                    She asked: {item.asked}
                  </div>
                ) : null}
                <div style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.45, marginTop: 4 }}>
                  {item.line}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {view.thread.map((message) => (
            <ChatBubble key={message.id} message={message} />
          ))}
        </div>
      </Card>
    </div>
    </ErrorBoundary>
  );
}
