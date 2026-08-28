/**
 * Overview funnel: all-time unpaid range leads (true leads) plus today's pulse.
 * Optional one-more email to unpaid quiz emails who have not paid.
 */
import { useEffect, useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { Card, Btn } from "../components/ui";
import { supabase } from "../lib/supabase";
import { loadQuizFunnelPulse } from "./quizFunnel";
import { unpaidOneMorePreviewText } from "../../functions/_shared/unpaidLeadsBlast.js";

function PulsePill({ label, value, bg, color, onClick }) {
  const style = {
    flex: "1 1 30%",
    minWidth: 100,
    background: bg,
    borderRadius: 12,
    padding: "12px 8px",
    textAlign: "center",
    fontFamily: F,
    border: "none",
    cursor: onClick ? "pointer" : "default",
    appearance: "none",
    WebkitAppearance: "none",
  };
  const inner = (
    <>
      <div style={{ fontFamily: FD, fontSize: 24, color }}>{value}</div>
      <div style={{ fontSize: 11.5, fontWeight: 700, color, lineHeight: 1.3, marginTop: 2 }}>
        {label}
      </div>
    </>
  );
  if (!onClick) return <div style={style}>{inner}</div>;
  return (
    <button type="button" onClick={onClick} style={style} aria-label={`${label}: ${value}. Open quiz leads.`}>
      {inner}
    </button>
  );
}

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Sign in again.");
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

export function AdminQuizFunnelCard({ onOpenLeads }) {
  const [pulse, setPulse] = useState(null);
  const [error, setError] = useState("");
  const [showMail, setShowMail] = useState(false);
  const [preview, setPreview] = useState(null);
  const [mailBusy, setMailBusy] = useState(false);
  const [mailErr, setMailErr] = useState("");
  const [mailOk, setMailOk] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadQuizFunnelPulse()
      .then((next) => {
        if (!cancelled) {
          setPulse(next);
          setError("");
        }
      })
      .catch((e) => {
        console.error("quiz funnel pulse failed", e);
        if (!cancelled) setError("Couldn't load the funnel.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openUnpaid = () => onOpenLeads?.("unpaid");
  const openAll = () => onOpenLeads?.("all");
  const openPaid = () => onOpenLeads?.("paid");

  const loadPreview = async () => {
    setMailBusy(true);
    setMailErr("");
    setMailOk("");
    try {
      const headers = await authHeaders();
      const resp = await fetch("/api/unpaid-leads-blast", {
        method: "POST",
        headers,
        body: JSON.stringify({ dryRun: true }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || "Couldn't preview this send.");
      setPreview(data);
    } catch (e) {
      setMailErr(e.message || "Couldn't preview this send.");
    } finally {
      setMailBusy(false);
    }
  };

  const onToggleMail = async () => {
    const next = !showMail;
    setShowMail(next);
    if (next && !preview) await loadPreview();
  };

  const onSend = async () => {
    const n = preview?.candidates ?? pulse?.unpaidLeads ?? 0;
    if (!n) return;
    const ok = window.confirm(
      `Send this note to ${n} unpaid lead${n === 1 ? "" : "s"}? Each address gets it once.`,
    );
    if (!ok) return;
    setMailBusy(true);
    setMailErr("");
    setMailOk("");
    try {
      const headers = await authHeaders();
      const resp = await fetch("/api/unpaid-leads-blast", {
        method: "POST",
        headers,
        body: JSON.stringify({ dryRun: false }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || "Send failed.");
      setPreview(data);
      setMailOk(`Sent ${data.sent}. ${data.errors ? `${data.errors} failed.` : ""}`.trim());
    } catch (e) {
      setMailErr(e.message || "Send failed.");
    } finally {
      setMailBusy(false);
    }
  };

  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 6 }}>Funnel</div>
      <p style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.5, margin: "0 0 12px" }}>
        True leads submitted ranges and have not paid. Today is midnight Pacific.
        Bounces show in Sentry as quiz_signup_bounce.
      </p>
      {error ? (
        <div style={{ fontSize: 13.5, color: T.amber, lineHeight: 1.45 }}>{error}</div>
      ) : !pulse ? (
        <div style={{ fontSize: 13.5, color: T.inkSoft }}>Loading the funnel…</div>
      ) : (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.inkSoft, marginBottom: 8 }}>
            All unpaid range leads
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <PulsePill
              label="Ranges in"
              value={pulse.rangesSubmitted}
              bg={T.accentSoft}
              color={T.accentDeep}
              onClick={openAll}
            />
            <PulsePill
              label="Unpaid (true leads)"
              value={pulse.unpaidLeads}
              bg={T.track}
              color={T.inkSoft}
              onClick={openUnpaid}
            />
            <PulsePill
              label="Paid from quiz"
              value={pulse.paidFromQuiz}
              bg={T.sageSoft}
              color={T.sage}
              onClick={openPaid}
            />
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: T.inkSoft, margin: "16px 0 8px" }}>
            Today
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <PulsePill
              label="Quiz leads"
              value={pulse.quizLeads}
              bg={T.accentSoft}
              color={T.accentDeep}
              onClick={openAll}
            />
            <PulsePill
              label="Unpaid signups"
              value={pulse.unpaidSignups}
              bg={T.track}
              color={T.inkSoft}
              onClick={openUnpaid}
            />
            <PulsePill
              label="Paid"
              value={pulse.paid}
              bg={T.sageSoft}
              color={T.sage}
              onClick={openPaid}
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <Btn ghost onClick={onToggleMail} disabled={mailBusy}>
              {showMail ? "Hide email" : "Email unpaid leads"}
            </Btn>
          </div>
        </>
      )}

      {showMail && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${T.border}` }}>
          <div style={{ fontFamily: FD, fontSize: 16, marginBottom: 8 }}>One more note</div>
          <p style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.5, margin: "0 0 10px" }}>
            Goes to unpaid range leads. Skips unsubscribed, pregnancy, and plant-based.
            Do not promise a week-back refund here. Terms still say purchases are final
            except if we decline enrollment.
          </p>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontFamily: F,
              fontSize: 14,
              lineHeight: 1.5,
              margin: "0 0 12px",
              color: T.ink,
            }}
          >
            {preview?.preview || unpaidOneMorePreviewText("Mama")}
          </pre>
          {mailBusy && !preview ? (
            <div style={{ fontSize: 13.5, color: T.inkSoft }}>Counting who would get this…</div>
          ) : preview ? (
            <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.45, marginBottom: 10 }}>
              {preview.candidates} will get this
              {pulse?.unpaidLeads != null ? ` · ${pulse.unpaidLeads} unpaid true leads` : ""}.
            </div>
          ) : null}
          {mailErr ? (
            <div style={{ fontSize: 13.5, color: T.amber, lineHeight: 1.45, marginBottom: 10 }}>{mailErr}</div>
          ) : null}
          {mailOk ? (
            <div style={{ fontSize: 13.5, color: T.sage, lineHeight: 1.45, marginBottom: 10 }}>{mailOk}</div>
          ) : null}
          <Btn onClick={onSend} disabled={mailBusy || !preview?.candidates}>
            {mailBusy ? "Sending…" : `Send to ${preview?.candidates ?? "…"}`}
          </Btn>
        </div>
      )}
    </Card>
  );
}
