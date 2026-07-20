import { FD, T } from "../theme/tokens";
import { Shell, Card, Btn } from "../components/ui";

/** Shown when enrollment was refunded after an intake eligibility decline. */
export function GoodbyePage({ onBack }) {
  return (
    <Shell>
      <Card style={{ marginTop: 30, textAlign: "center", padding: 30 }}>
        <div style={{ fontSize: 34 }}>🤍</div>
        <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "10px 0" }}>
          We&apos;ll be here when the time is right
        </h2>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: T.inkSoft }}>
          Your $149 has been fully refunded — it&apos;ll land back on your card in a few days.
          Take care of yourself, mama.
        </p>
        {onBack && (
          <Btn ghost onClick={onBack} style={{ marginTop: 8 }}>Back to start</Btn>
        )}
      </Card>
    </Shell>
  );
}
