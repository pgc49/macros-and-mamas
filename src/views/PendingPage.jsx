import { FD, T } from "../theme/tokens";
import { Shell, Card } from "../components/ui";

/** Paid + intake complete — waiting on Callie to approve macros. */
export function PendingPage() {
  return (
    <Shell>
      <Card style={{ marginTop: 30, textAlign: "center", padding: 30 }}>
        <div style={{ fontSize: 34 }}>💌</div>
        <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "10px 0" }}>
          Callie is building your macros
        </h2>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: T.inkSoft }}>
          Your answers are with her now. She reviews every mama&apos;s numbers personally before they go live — usually within a day. The moment she approves, your dashboard unlocks and your WhatsApp group invite arrives by text.
        </p>
      </Card>
    </Shell>
  );
}
