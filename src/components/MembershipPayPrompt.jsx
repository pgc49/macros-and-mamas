import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { T, FD } from "../theme/tokens";
import { Card, Btn } from "./ui";
import { membershipPayPromptCopy } from "../lib/membershipAccess";
import { startMembershipCheckout } from "../lib/billing";

/**
 * The pay step on Today (and on /membership).
 * One price, one Stripe button. Logging under it stays paused.
 */
export function MembershipPayPrompt({ profile, onPay, sticky = true }) {
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const copy = membershipPayPromptCopy(profile);
  const canceled = params.get("membership") === "cancel";

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
        margin: "4px 0 14px",
        background: T.accentSoft,
        border: `1.5px solid ${T.accent}`,
        boxShadow: "0 10px 28px rgba(142, 47, 83, 0.08)",
        position: sticky ? "sticky" : "static",
        top: sticky ? 0 : undefined,
        zIndex: sticky ? 3 : undefined,
      }}
    >
      <div data-membership-pay-prompt="true" style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: T.accentDeep }}>
        {copy.eyebrow}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
        <span style={{ fontFamily: FD, fontSize: 42, lineHeight: 1, color: T.ink }}>{copy.price}</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: T.inkSoft }}>{copy.period}</span>
      </div>
      <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 24, margin: "10px 0 8px", color: T.ink }}>
        {copy.title}
      </h2>
      <p style={{ fontSize: 15, color: T.ink, lineHeight: 1.55, margin: "0 0 14px" }}>
        {copy.body}
      </p>
      {canceled && (
        <div style={{ fontSize: 14, color: T.inkSoft, lineHeight: 1.45, marginBottom: 12 }}>
          Checkout closed before payment. You can pay whenever you are ready.
        </div>
      )}
      {done && (
        <div style={{ fontSize: 14, color: T.accentDeep, marginBottom: 12, lineHeight: 1.45 }}>{done}</div>
      )}
      {err && (
        <div style={{ fontSize: 14, color: T.accentDeep, marginBottom: 12 }}>{err}</div>
      )}
      <Btn style={{ width: "100%" }} disabled={busy} onClick={pay}>
        {busy ? "Opening checkout…" : copy.button}
      </Btn>
      <div style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.45, marginTop: 10 }}>
        {copy.fine}
      </div>
    </Card>
  );
}

/** Keeps history visible and stops logging until she pays. */
export function MembershipPaused({ paused, children }) {
  if (!paused) return children;
  return (
    <div data-membership-paused="true" inert style={{ opacity: 0.72, pointerEvents: "none" }}>
      {children}
    </div>
  );
}
