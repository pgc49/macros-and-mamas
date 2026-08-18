import { useMemo, useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { Card, Btn, inputStyle } from "../components/ui";
import { AdminVoiceDropCard } from "./AdminVoiceDropCard";
import { db } from "../db/db";

function isAdminProfile(c) {
  return String(c?.role || "").toLowerCase() === "admin";
}

/**
 * Visual preview matching message-email (Resend) layout for announcements.
 * Push always goes out; email is the fallback when a mama has no push.
 * Real emails only include a short snippet — we show that clearly + the full text.
 */
function AnnouncementEmailPreview({ body }) {
  const full = String(body || "").trim();
  const emailSnippet = full.replace(/\s+/g, " ").slice(0, 140);
  const snippetCut = full.replace(/\s+/g, " ").length > 140;

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{
        fontSize: 12,
        fontWeight: 700,
        color: T.inkSoft,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        marginBottom: 8,
      }}
      >
        Email preview · fallback when push isn’t on
      </div>
      <p style={{ fontSize: 12.5, color: T.inkSoft, margin: "0 0 10px", lineHeight: 1.45 }}>
        Emails show a short teaser (below). The full announcement always lands in Messages.
      </p>
      <div style={{
        background: T.bg,
        borderRadius: 14,
        padding: "16px 14px",
        border: `1px solid ${T.border}`,
      }}
      >
        <div style={{
          fontSize: 11,
          letterSpacing: "1.2px",
          textTransform: "uppercase",
          color: T.accentDeep,
          fontFamily: F,
          marginBottom: 12,
        }}
        >
          Macros and Mamas
        </div>
        <div style={{
          background: "#fff",
          borderRadius: 14,
          padding: "18px 16px",
          border: `1px solid ${T.border}`,
        }}
        >
          <div style={{
            fontSize: 13,
            color: T.inkSoft,
            marginBottom: 10,
            fontFamily: F,
          }}
          >
            Subject: <span style={{ color: T.ink, fontWeight: 700 }}>Callie sent you a message</span>
          </div>
          <h3 style={{
            fontFamily: FD,
            fontWeight: 400,
            fontSize: 22,
            margin: "0 0 12px",
            color: T.ink,
          }}
          >
            Hi Mama,
          </h3>
          <div style={{ fontSize: 14.5, lineHeight: 1.55, color: T.ink, fontFamily: F }}>
            <p style={{ margin: "0 0 12px" }}>Callie left you a message in Macros and Mamas.</p>
            {emailSnippet ? (
              <p style={{
                margin: "0 0 12px",
                background: T.bg,
                borderRadius: 12,
                padding: "12px 14px",
                fontStyle: "italic",
                color: T.ink,
                whiteSpace: "pre-wrap",
              }}
              >
                {emailSnippet}{snippetCut ? "…" : ""}
              </p>
            ) : (
              <p style={{
                margin: "0 0 12px",
                color: T.inkSoft,
                fontStyle: "italic",
              }}
              >
                Your announcement teaser appears here…
              </p>
            )}
            <p style={{ margin: "0 0 16px" }}>
              Open the app → <b>Messages</b> to read and reply.
            </p>
            <div style={{
              display: "inline-block",
              background: T.accent,
              color: "#fff",
              fontWeight: 700,
              fontSize: 14,
              padding: "12px 18px",
              borderRadius: 999,
              fontFamily: F,
            }}
            >
              Open Messages
            </div>
          </div>
        </div>
        <p style={{
          fontSize: 11.5,
          lineHeight: 1.45,
          color: T.inkSoft,
          fontFamily: F,
          margin: "12px 4px 0",
        }}
        >
          Macros and Mamas · Sacramento, CA · Reply to this email anytime.
        </p>
      </div>
      {full ? (
        <div style={{ marginTop: 12 }}>
          <div style={{
            fontSize: 12,
            fontWeight: 700,
            color: T.inkSoft,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            marginBottom: 6,
          }}
          >
            Full text in Messages
          </div>
          <div style={{
            fontSize: 13.5,
            lineHeight: 1.5,
            color: T.ink,
            fontFamily: F,
            whiteSpace: "pre-wrap",
            background: "#fff",
            border: `1px solid ${T.border}`,
            borderRadius: 12,
            padding: "12px 14px",
          }}
          >
            {full}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Admin Announcements — broadcast text + Monday voice drop.
 * Messages tab stays 1:1 only.
 */
export function AdminAnnouncements({ roster = [], cohortFilter = "all" }) {
  const [announceBody, setAnnounceBody] = useState("");
  const [announceAudience, setAnnounceAudience] = useState("active");
  const [announceBusy, setAnnounceBusy] = useState(false);
  const [announceMsg, setAnnounceMsg] = useState("");
  const [error, setError] = useState("");
  const [showEmailPreview, setShowEmailPreview] = useState(true);

  const activeMamaCount = useMemo(
    () => (roster || []).filter((c) => {
      if (isAdminProfile(c)) return false;
      return c.stage === "active" || c.status === "active";
    }).length,
    [roster],
  );
  const allMamaCount = useMemo(
    () => (roster || []).filter((c) => !isAdminProfile(c) && !c.refunded).length,
    [roster],
  );

  const sendAnnouncement = async () => {
    const text = announceBody.trim();
    if (!text) return;
    const n = announceAudience === "all_mamas" ? allMamaCount : activeMamaCount;
    if (!window.confirm(
      `Send this announcement to ${n} mama${n === 1 ? "" : "s"}?`
      + " They’ll get it in Messages + a push (email if push isn’t on).",
    )) {
      return;
    }
    setAnnounceBusy(true);
    setAnnounceMsg("");
    setError("");
    try {
      const result = await db.broadcastAnnouncement({
        body: text,
        audience: announceAudience,
      });
      setAnnounceBody("");
      const parts = [
        `Sent to ${result.messages || 0} thread${(result.messages || 0) === 1 ? "" : "s"}`,
      ];
      if (result.skipped) parts.push(`${result.skipped} already had it`);
      if (result.notifying) {
        parts.push("push/email sending in background");
      } else {
        if (result.pushSent) parts.push(`${result.pushSent} push`);
        if (result.emailSent) parts.push(`${result.emailSent} email`);
      }
      if (result.note) parts.push(result.note);
      setAnnounceMsg(`${parts.join(" · ")}.`);
    } catch (e) {
      console.error(e);
      setError(e.message || "Couldn’t send announcement.");
    } finally {
      setAnnounceBusy(false);
    }
  };

  return (
    <div>
      <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 28, margin: "4px 0 6px" }}>
        Announcements
      </h2>
      <p style={{ fontSize: 14, color: T.inkSoft, margin: "0 0 14px", lineHeight: 1.5 }}>
        Same note to many mamas at once — it lands in each mama&apos;s Messages thread plus a push
        (email if push isn&apos;t on). Monday voice drops show on Today. Private replies stay in Messages.
      </p>
      {error && <div style={{ fontSize: 13, color: T.amber, marginBottom: 10 }}>{error}</div>}

      <Card style={{ marginBottom: 14, padding: 14 }}>
        <div style={{ fontFamily: FD, fontSize: 20, marginBottom: 4 }}>Announce to mamas</div>
        <p style={{ fontSize: 13, color: T.inkSoft, margin: "0 0 10px", lineHeight: 1.45 }}>
          Posts as a Callie announcement in each mama’s Messages thread and sends a push
          (email if push isn’t on). Good for app-update notes and schedule tips.
        </p>
        <textarea
          value={announceBody}
          onChange={(e) => setAnnounceBody(e.target.value.slice(0, 2000))}
          rows={4}
          placeholder="App update, schedule note, quick tip…"
          style={{
            ...inputStyle,
            resize: "vertical",
            minHeight: 88,
            fontFamily: F,
          }}
        />
        <div style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
          marginTop: 10,
        }}
        >
          <label style={{ fontSize: 13, fontWeight: 700, color: T.inkSoft, display: "flex", alignItems: "center", gap: 6 }}>
            To
            <select
              value={announceAudience}
              onChange={(e) => setAnnounceAudience(e.target.value)}
              style={{
                ...inputStyle,
                width: "auto",
                padding: "8px 10px",
                fontSize: 13,
              }}
            >
              <option value="active">Active mamas ({activeMamaCount})</option>
              <option value="all_mamas">All mamas ({allMamaCount})</option>
            </select>
          </label>
          <Btn
            small
            ghost
            onClick={() => setShowEmailPreview((v) => !v)}
          >
            {showEmailPreview ? "Hide email preview" : "Preview email"}
          </Btn>
          <Btn
            small
            onClick={sendAnnouncement}
            disabled={announceBusy || !announceBody.trim()}
          >
            {announceBusy ? "Sending…" : "Send announcement"}
          </Btn>
        </div>
        {announceMsg && (
          <div style={{ fontSize: 13, color: "#3E5A46", marginTop: 10 }}>{announceMsg}</div>
        )}
        {showEmailPreview && (
          <AnnouncementEmailPreview body={announceBody} />
        )}
      </Card>

      <AdminVoiceDropCard
        activeMamaCount={activeMamaCount}
        allMamaCount={allMamaCount}
        cohortFilter={cohortFilter}
        roster={roster}
      />
    </div>
  );
}
