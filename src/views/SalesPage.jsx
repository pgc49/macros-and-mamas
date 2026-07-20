import { Link } from "react-router-dom";
import { T, FD, F } from "../theme/tokens";
import { FEATURES } from "../content/data";
import { Fonts } from "../theme/Fonts";
import { Btn } from "../components/ui";
import { PATHS } from "../routing";

const heroImg = "/callie-hero.jpg";

export function SalesPage({ onStartIntake, onSignIn }) {
  return (
    <div style={{ fontFamily: F, background: T.bg, minHeight: "100vh", color: T.ink }}>
      <Fonts />

      {/* Full-bleed first viewport: brand + photo + one CTA */}
      <section
        style={{
          position: "relative",
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          overflow: "hidden",
          background: T.ink,
        }}
      >
        <img
          src={heroImg}
          alt="Callie outdoors with her baby"
          width={1600}
          height={2133}
          decoding="async"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center 18%",
          }}
        />
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(51,39,46,0.22) 0%, rgba(51,39,46,0.18) 40%, rgba(51,39,46,0.78) 78%, rgba(51,39,46,0.92) 100%)",
          }}
        />

        <div
          style={{
            position: "relative",
            zIndex: 1,
            maxWidth: 560,
            width: "100%",
            margin: "0 auto",
            padding: "28px 20px 40px",
            color: "#fff",
          }}
        >
          <div>
            <div style={{ fontFamily: FD, fontSize: "clamp(36px, 9vw, 48px)", letterSpacing: 0.3, lineHeight: 1.05, marginBottom: 4 }}>
              Macros and Mamas
            </div>
            <div style={{
              fontSize: 12, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase",
              color: "rgba(255,255,255,0.82)", marginBottom: 18,
            }}>
              ranges, not rules
            </div>
            <h1 style={{
              fontFamily: FD, fontSize: "clamp(28px, 7vw, 36px)", lineHeight: 1.15,
              margin: "0 0 12px", fontWeight: 400,
            }}>
              Lose the weight.<br />
              Keep the muscle.<br />
              <span style={{ color: "#F6C9D8" }}>Eat like a mother.</span>
            </h1>
            <p style={{
              fontSize: 16, lineHeight: 1.5, margin: "0 0 20px",
              color: "rgba(255,255,255,0.88)", maxWidth: 420,
            }}>
              An 8-week macro program for moms — personalized ranges, real food, and Callie in your pocket all week.
            </p>
          </div>

          <div>
            <Btn
              onClick={onStartIntake}
              style={{ width: "100%", background: "#fff", color: T.accentDeep }}
            >
              Join the founding group — $149
            </Btn>
            <div style={{ textAlign: "center", fontSize: 12.5, color: "rgba(255,255,255,0.7)", marginTop: 8 }}>
              Founding price. Goes to $299+ after this group fills.
            </div>
            {onSignIn && (
              <div style={{ textAlign: "center", marginTop: 14 }}>
                <button
                  onClick={onSignIn}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    fontFamily: F, fontSize: 13.5, fontWeight: 700,
                    color: "#fff", textDecoration: "underline",
                  }}
                >
                  Already enrolled? Sign in
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "28px 16px 90px" }}>
        <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 24, margin: "0 0 12px" }}>What&apos;s inside</h2>
        {FEATURES.map((f) => (
          <div key={f.title} style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 18 }}>
            <div style={{ fontSize: 24, lineHeight: 1 }}>{f.icon}</div>
            <div>
              <div style={{ fontFamily: FD, fontSize: 17, marginBottom: 3 }}>{f.title}</div>
              <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.55 }}>{f.body}</div>
            </div>
          </div>
        ))}

        <div style={{
          marginTop: 8, padding: "16px 0",
          borderTop: `1px solid ${T.border}`,
          borderBottom: `1px solid ${T.border}`,
        }}>
          <div style={{ fontSize: 14, lineHeight: 1.6, color: T.accentDeep }}>
            <b>The promise:</b> we never crash. Losing faster than 1–1.5 lbs a week means you&apos;re losing muscle, and muscle is the whole point. We eat enough, we lift, we lose fat.
          </div>
        </div>

        <div style={{ marginTop: 22 }}>
          <div style={{ fontFamily: FD, fontSize: 20, marginBottom: 6 }}>Who this is for</div>
          <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.7 }}>
            Moms ready to lose the weight and build strength — whether your baby is three months or sixteen years. Breastfeeding mamas are welcome from three months postpartum (your macros are set gently; supply comes first). Not for pregnancy.
          </div>
        </div>

        <div style={{ margin: "22px 0 6px" }}>
          <Btn onClick={onStartIntake} style={{ width: "100%" }}>Start my intake</Btn>
        </div>

        <p style={{ textAlign: "center", fontSize: 12.5, color: T.inkSoft, margin: "18px 0 0" }}>
          <Link
            to={PATHS.terms}
            style={{ fontFamily: F, fontWeight: 700, color: T.accent, textDecoration: "underline" }}
          >
            Terms and Conditions
          </Link>
        </p>
      </div>
    </div>
  );
}
