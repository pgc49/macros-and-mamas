import { useState } from "react";
import { Link } from "react-router-dom";
import { FD, T } from "../theme/tokens";
import { Shell, Card, Btn } from "../components/ui";
import { startCheckout } from "../lib/checkout";
import { CONFIG } from "../config";
import { PATHS } from "../routing";

/** Unpaid signed-in users finish joining here before intake. */
export function JoinPage({ onRefresh }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const enrollmentOpen = CONFIG.ENROLLMENT_OPEN;

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

  // Founding closed: still let already-started unpaid accounts finish paying.
  // Brand-new public enrollment goes through the homepage waitlist.
  if (!enrollmentOpen) {
    return (
      <Shell>
        <Card style={{ marginTop: 30, textAlign: "center", padding: 30 }}>
          <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "0 0 10px" }}>
            Founding group is closed
          </h2>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: T.inkSoft, margin: "0 0 16px" }}>
            New spots open with cohort two. If you already started checkout, you can still finish paying below —
            otherwise join the waitlist for priority access.
          </p>
          <Btn style={{ width: "100%", marginTop: 4 }} disabled={busy} onClick={pay}>
            {busy ? "Redirecting to Stripe…" : "I already started — finish paying $149"}
          </Btn>
          {error && (
            <div style={{ marginTop: 12, fontSize: 13.5, color: T.amber, lineHeight: 1.5 }}>{error}</div>
          )}
          <Link
            to={PATHS.waitlist}
            style={{
              display: "block",
              marginTop: 16,
              fontWeight: 700,
              fontSize: 14,
              color: T.accent,
              textDecoration: "underline",
            }}
          >
            Join the cohort two waitlist
          </Link>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              style={{
                display: "block", margin: "14px auto 0", background: "none", border: "none",
                color: T.inkSoft, fontWeight: 700, fontSize: 13, cursor: "pointer", textDecoration: "underline",
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
