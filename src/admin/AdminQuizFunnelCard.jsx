/**
 * Overview pulse: today's quiz leads, unpaid signups, and paid (PT).
 * Bounces are Sentry-only — this card does not call the Sentry API.
 */
import { useEffect, useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { Card } from "../components/ui";
import { loadQuizFunnelPulse } from "./quizFunnel";

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

export function AdminQuizFunnelCard({ onOpenLeads }) {
  const [pulse, setPulse] = useState(null);
  const [error, setError] = useState("");

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
        if (!cancelled) setError("Couldn't load today's funnel.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 6 }}>Today&apos;s funnel</div>
      <p style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.5, margin: "0 0 12px" }}>
        Quiz leads, unpaid accounts, and paid — since midnight Pacific.
        Bounces show in Sentry as quiz_signup_bounce.
      </p>
      {error ? (
        <div style={{ fontSize: 13.5, color: T.amber, lineHeight: 1.45 }}>{error}</div>
      ) : !pulse ? (
        <div style={{ fontSize: 13.5, color: T.inkSoft }}>Loading today&apos;s funnel…</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <PulsePill
            label="Quiz leads"
            value={pulse.quizLeads}
            bg={T.accentSoft}
            color={T.accentDeep}
            onClick={onOpenLeads}
          />
          <PulsePill label="Unpaid signups" value={pulse.unpaidSignups} bg={T.track} color={T.inkSoft} />
          <PulsePill label="Paid" value={pulse.paid} bg={T.sageSoft} color={T.sage} />
        </div>
      )}
    </Card>
  );
}
