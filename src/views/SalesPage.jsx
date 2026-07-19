import { T, FD } from "../theme/tokens";
import { FEATURES } from "../content/data";
import { Shell, Card, Btn } from "../components/ui";

export function SalesPage({ onStartIntake, onSignIn }) {
  return (
    <Shell>
      <div style={{ padding: "30px 4px 8px" }}>
        <h1 style={{ fontFamily: FD, fontSize: 40, lineHeight: 1.12, margin: "0 0 14px", fontWeight: 400 }}>
          Lose the weight.<br />Keep the muscle.<br /><span style={{ color: T.accent }}>Eat like a mother.</span>
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.55, color: T.inkSoft, margin: "0 0 18px" }}>
          An 8-week macro program for moms who are done with 1,200-calorie plans that steal your energy, your muscle, and your milk supply. Personalized ranges, real food, and Callie in your pocket all week.
        </p>
        {/* PROD-TODO(stripe): today this goes to intake, and payment
            happens after Callie approves. If the flow changes to
            pay-first, swap this onClick to startCheckout. */}
        <Btn onClick={onStartIntake} style={{ width: "100%" }}>Join the founding group — $149</Btn>
        <div style={{ textAlign: "center", fontSize: 12.5, color: T.inkSoft, marginTop: 8 }}>
          Founding price. Goes to $299+ after this group fills.
        </div>
        {onSignIn && (
          <div style={{ textAlign: "center", marginTop: 14 }}>
            <button
              onClick={onSignIn}
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontFamily: "inherit", fontSize: 13.5, fontWeight: 700, color: T.accent, textDecoration: "underline",
              }}
            >
              Already enrolled? Sign in
            </button>
          </div>
        )}
      </div>

      <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 24, margin: "26px 0 12px" }}>What's inside</h2>
      {FEATURES.map((f) => (
        <Card key={f.title} style={{ marginBottom: 10, display: "flex", gap: 14, alignItems: "flex-start" }}>
          <div style={{ fontSize: 24, lineHeight: 1 }}>{f.icon}</div>
          <div>
            <div style={{ fontFamily: FD, fontSize: 17, marginBottom: 3 }}>{f.title}</div>
            <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.55 }}>{f.body}</div>
          </div>
        </Card>
      ))}

      <Card style={{ marginTop: 14, background: T.accentSoft, border: "none" }}>
        <div style={{ fontSize: 14, lineHeight: 1.6, color: T.accentDeep }}>
          <b>The promise:</b> we never crash. Losing faster than 1–1.5 lbs a week means you're losing muscle, and muscle is the whole point. We eat enough, we lift, we lose fat.
        </div>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <div style={{ fontFamily: FD, fontSize: 17, marginBottom: 6 }}>Who this is for</div>
        <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.7 }}>
          Moms 6+ months postpartum with weight they're ready to lose — including breastfeeding mamas (your macros are set gently; supply comes first).
          Not for pregnancy or the first six months of nursing, and the plan is built around animal protein.
        </div>
      </Card>

      <div style={{ margin: "20px 0 6px" }}>
        <Btn onClick={onStartIntake} style={{ width: "100%" }}>Start my intake</Btn>
      </div>
    </Shell>
  );
}
