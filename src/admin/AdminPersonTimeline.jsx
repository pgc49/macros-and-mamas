import { useEffect, useMemo, useState } from "react";
import { T, FD } from "../theme/tokens";
import { Card } from "../components/ui";
import { db } from "../db/db";
import { emailTypeLabel } from "./emailLog";
import { formatDripWhen, planLeadDrips } from "./leadDripSchedule";

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

export function AdminPersonTimeline({ client, lead }) {
  const [events, setEvents] = useState([]);
  const [messages, setMessages] = useState([]);

  const email = client?.email || lead?.email;
  const profileId = client?.id || lead?.profileId;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [mail, dms] = await Promise.all([
        email ? db.loadEmailEventsByEmail(email) : db.loadEmailEvents(profileId),
        profileId ? db.loadMessages(profileId).catch(() => []) : [],
      ]);
      if (!cancelled) {
        setEvents(mail || []);
        setMessages(dms || []);
      }
    })();
    return () => { cancelled = true; };
  }, [email, profileId]);

  const items = useMemo(() => {
    const out = [];
    for (const e of events) {
      out.push({
        key: `e-${e.id}`,
        at: Date.parse(e.created_at) || 0,
        kind: "email",
        title: emailTypeLabel(e),
        detail: e.subject || e.to_email || "",
      });
    }
    for (const m of messages) {
      const preview = String(m.body || "").trim().slice(0, 80)
        || (m.attachment_name ? `Sent ${m.attachment_name}` : "Message");
      out.push({
        key: `m-${m.id}`,
        at: Date.parse(m.created_at) || 0,
        kind: "dm",
        title: m.kind === "voice" || /\.m4a|\.webm/i.test(m.attachment_name || "")
          ? "Voice memo"
          : "Message",
        detail: preview,
      });
    }
    if (lead) {
      const plan = planLeadDrips({ lead, events });
      for (const step of plan.remaining || []) {
        out.push({
          key: `drip-${step.emailType}`,
          at: Number.isFinite(step.atMs) ? step.atMs : Date.now() + 1,
          kind: "scheduled",
          title: `Scheduled · ${emailTypeLabel({ email_type: step.emailType })}`,
          detail: formatDripWhen(step),
        });
      }
    }
    return out.sort((a, b) => b.at - a.at).slice(0, 30);
  }, [events, messages, lead]);

  if (!items.length) return null;

  return (
    <Card style={{ marginTop: 12 }}>
      <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 8 }}>Timeline</div>
      {items.map((item) => (
        <div
          key={item.key}
          style={{ padding: "8px 0", borderBottom: `1px solid ${T.border}` }}
        >
          <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>
            {item.kind === "email" ? "✉ " : item.kind === "scheduled" ? "◷ " : "💬 "}
            {item.title}
          </div>
          <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 2 }}>
            {item.detail}
            {item.at ? ` · ${formatWhen(new Date(item.at).toISOString())}` : ""}
          </div>
        </div>
      ))}
    </Card>
  );
}
