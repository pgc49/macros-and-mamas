import { useState } from "react";
import { FD, T } from "../theme/tokens";
import { Shell, Card, Btn } from "../components/ui";
import { supabase } from "../lib/supabase";

export function PendingPage({ approved = false, onPaidRefresh }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const startCheckout = async () => {
    setBusy(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError("Please sign in again to complete enrollment.");
        setBusy(false);
        return;
      }
      const resp = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.url) {
        throw new Error(data.error || `checkout failed: ${resp.status}`);
      }
      window.location.href = data.url;
    } catch (e) {
      console.error("checkout failed", e);
      setError("Couldn't start checkout. Try again in a moment.");
      setBusy(false);
    }
  };

  if (approved) {
    return (
      <Shell>
        <Card style={{ marginTop: 30, textAlign: "center", padding: 30 }}>
          <div style={{ fontSize: 34 }}>✨</div>
          <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "10px 0" }}>
            Complete your enrollment — $149
          </h2>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: T.inkSoft }}>
            Callie approved your macros. Secure your founding-group spot to unlock your dashboard, ranges, and the Mamas group.
          </p>
          <Btn style={{ width: "100%", marginTop: 8 }} disabled={busy} onClick={startCheckout}>
            {busy ? "Redirecting to Stripe…" : "Pay $149 — complete enrollment"}
          </Btn>
          {error && (
            <div style={{ marginTop: 12, fontSize: 13.5, color: T.amber, lineHeight: 1.5 }}>{error}</div>
          )}
          {onPaidRefresh && (
            <button
              onClick={onPaidRefresh}
              style={{
                display: "block", margin: "14px auto 0", background: "none", border: "none",
                color: T.accent, fontWeight: 700, fontSize: 13, cursor: "pointer", textDecoration: "underline",
              }}
            >
              I already paid — refresh
            </button>
          )}
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card style={{ marginTop: 30, textAlign: "center", padding: 30 }}>
        <div style={{ fontSize: 34 }}>💌</div>
        <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "10px 0" }}>Callie is building your macros</h2>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: T.inkSoft }}>
          Your answers are with her now. She reviews every mama's numbers personally before they go live — usually within a day. The moment she approves, your dashboard unlocks and your WhatsApp group invite arrives by text.
        </p>
      </Card>
    </Shell>
  );
}
