import { FD, T } from "../theme/tokens";
import { Shell, Card, Btn } from "../components/ui";

export function DeclinedPage({ declineReason, onBack }) {
  const msgs = {
    pregnant: { title: "Congratulations, mama.", body: "This program isn't built for pregnancy — your body needs abundance right now, not a deficit. Come back after baby arrives and you're at least six months postpartum. I'd love to have you then." },
    early: { title: "Not yet — and that's on purpose.", body: "You're under six months postpartum while breastfeeding, and I won't risk your milk supply. Your body is doing its most important work right now. Circle back once you pass the six-month mark; the program will be here." },
    diet: { title: "This one isn't the right fit.", body: "The program is built around animal protein — hitting these targets on a vegetarian or vegan diet is a different playbook, and I'd rather point you to a coach who specializes in it than give you a plan that fights you." },
  };
  const m = msgs[declineReason] || msgs.diet;
  return (
    <Shell>
      <Card style={{ marginTop: 30, textAlign: "center", padding: 30 }}>
        <div style={{ fontSize: 34 }}>🤍</div>
        <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "10px 0" }}>{m.title}</h2>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: T.inkSoft }}>{m.body}</p>
        <Btn ghost onClick={onBack} style={{ marginTop: 8 }}>Back to start</Btn>
      </Card>
    </Shell>
  );
}
