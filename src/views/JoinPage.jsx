import { useState } from "react";
import { FD, T } from "../theme/tokens";
import { Shell, Card, Btn } from "../components/ui";
import { startCheckout } from "../lib/checkout";

/** Unpaid signed-in users finish joining here before intake. */
export function JoinPage({ onRefresh }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const pay = async () => {
    setBusy(true);
    setError("");
    try {
      await startCheckout();
    } catch (e) {
      console.error("checkout failed", e);
      setError("Couldn't start checkout. Try again in a moment.");
      setBusy(false);
    }
  };

  return (
    <Shell>
      <Card style={{ marginTop: 30, textAlign: "center", padding: 30 }}>
        <div style={{ fontSize: 34 }}>✨</div>
        <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "10px 0" }}>
          Finish joining — $149
        </h2>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: T.inkSoft }}>
          Secure your founding-group spot. After checkout you&apos;ll complete a short intake so Callie can build your macros.
        </p>
        <Btn style={{ width: "100%", marginTop: 8 }} disabled={busy} onClick={pay}>
          {busy ? "Redirecting to Stripe…" : "Pay $149 — join the founding group"}
        </Btn>
        {error && (
          <div style={{ marginTop: 12, fontSize: 13.5, color: T.amber, lineHeight: 1.5 }}>{error}</div>
        )}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
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
