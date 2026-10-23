import { useState } from "react";
import { T, FD } from "../theme/tokens";
import { Card, Btn } from "./ui";
import { courtesyMonthCopy } from "../lib/membershipAccess";
import { startMembershipCheckout } from "../lib/billing";

/**
 * August Group, on Today, before and during Callie's courtesy month.
 * Explains the $49 tier and that one month of it is free.
 */
export function CourtesyMonthCard({ profile, onPay }) {
  const copy = courtesyMonthCopy(profile);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  if (!copy) return null;

  const pay = async () => {
    setErr("");
    setDone("");
    setBusy(true);
    try {
      const note = onPay
        ? await onPay()
        : await startMembershipCheckout({ cancelPath: "/dashboard" });
      if (typeof note === "string" && note) setDone(note);
      setBusy(false);
    } catch (e) {
      setErr(e?.message || "Couldn't open checkout.");
      setBusy(false);
    }
  };

  return (
    <Card
      style={{
        margin: "0 0 14px",
        background: T.sageSoft,
        border: "1px solid #C9D9CE",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#3E5A46" }}>
        {copy.eyebrow}
      </div>
      <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 24, margin: "8px 0 8px", color: T.ink }}>
        {copy.title}
      </h2>
      <p style={{ fontSize: 15, color: T.ink, lineHeight: 1.55, margin: "0 0 10px" }}>
        {copy.lead}
      </p>
      <p style={{ fontSize: 15, color: T.ink, lineHeight: 1.55, margin: "0 0 12px" }}>
        {copy.expectation}
      </p>
      <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 6 }}>
        What the monthly membership is
      </div>
      <ul style={{ margin: "0 0 14px", paddingLeft: 18, fontSize: 14.5, color: T.ink, lineHeight: 1.5 }}>
        {copy.includes.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      {done && (
        <div style={{ fontSize: 14, color: "#3E5A46", marginBottom: 12, lineHeight: 1.45 }}>{done}</div>
      )}
      {err && (
        <div style={{ fontSize: 14, color: T.accentDeep, marginBottom: 12 }}>{err}</div>
      )}
      {copy.button && (
        <Btn style={{ width: "100%" }} disabled={busy} onClick={pay}>
          {busy ? "Opening checkout…" : copy.button}
        </Btn>
      )}
      <div style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.45, marginTop: copy.button ? 10 : 0 }}>
        {copy.fine}
      </div>
    </Card>
  );
}
