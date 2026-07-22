import { FD, T } from "../theme/tokens";
import { Shell, Card, Btn } from "../components/ui";

const HOLD_COPY =
  "You're still enrolled for now — Callie will reach out to sort next steps with you.";

export function DeclinedPage({ declineReason, onBack, refundIssued = false }) {
  const msgs = {
    pregnant: {
      title: "Congratulations, mama.",
      body: "This program isn't recommended during pregnancy — your body needs abundance right now, not a deficit. Come back after baby arrives; we'd love to have you then.",
    },
    early: {
      title: "Not yet — and that's on purpose.",
      body: "You're under three months postpartum while nursing, and we won't risk your milk supply while it's still establishing. Your body is doing its most important work right now. Circle back once you pass the three-month mark; the program will be here.",
    },
    diet: {
      title: "This one isn't the right fit.",
      body: "The program is built around animal protein — hitting these targets on a vegetarian or vegan diet is a different playbook, and I'd rather point you to a coach who specializes in it than give you a plan that fights you.",
    },
  };
  const m = msgs[declineReason] || msgs.diet;
  return (
    <Shell>
      <Card style={{ marginTop: 30, textAlign: "center", padding: 30 }}>
        <div style={{ fontSize: 34 }}>🤍</div>
        <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "10px 0" }}>{m.title}</h2>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: T.inkSoft }}>{m.body}</p>
        <p style={{
          fontSize: 14.5, lineHeight: 1.55, color: T.accentDeep, fontWeight: 700,
          margin: "16px 0 0", padding: "12px 14px", background: T.accentSoft, borderRadius: 12,
        }}>
          {refundIssued
            ? "Your $149 has been fully refunded — it'll land back on your card in a few days. We'll be here when the time is right."
            : HOLD_COPY}
        </p>
        <Btn ghost onClick={onBack} style={{ marginTop: 14 }}>Back to start</Btn>
      </Card>
    </Shell>
  );
}
