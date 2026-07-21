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
      <style>{`
        .mm-hero {
          position: relative;
          min-height: 100dvh;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          overflow: hidden;
          background: ${T.ink};
        }
        .mm-hero-media {
          position: absolute;
          inset: 0;
        }
        .mm-hero-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center 18%;
          display: block;
        }
        .mm-hero-scrim {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(180deg, rgba(51,39,46,0.22) 0%, rgba(51,39,46,0.18) 40%, rgba(51,39,46,0.78) 78%, rgba(51,39,46,0.92) 100%);
          pointer-events: none;
        }
        .mm-hero-copy {
          position: relative;
          z-index: 1;
          max-width: 560px;
          width: 100%;
          margin: 0 auto;
          padding: 28px 20px 40px;
          color: #fff;
        }
        .mm-hero-brand {
          font-family: ${FD};
          font-size: clamp(36px, 9vw, 48px);
          letter-spacing: 0.3px;
          line-height: 1.05;
          margin-bottom: 4px;
        }
        .mm-hero-kicker {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 1.4px;
          text-transform: uppercase;
          color: rgba(255,255,255,0.82);
          margin-bottom: 18px;
        }
        .mm-hero-headline {
          font-family: ${FD};
          font-size: clamp(28px, 7vw, 36px);
          line-height: 1.15;
          margin: 0 0 12px;
          font-weight: 400;
        }
        .mm-hero-accent {
          color: #F6C9D8;
        }
        .mm-hero-lede {
          font-size: 16px;
          line-height: 1.5;
          margin: 0 0 20px;
          color: rgba(255,255,255,0.88);
          max-width: 420px;
        }
        .mm-hero-cta-note {
          text-align: center;
          font-size: 12.5px;
          color: rgba(255,255,255,0.7);
          margin-top: 8px;
        }
        .mm-hero-signin {
          background: none;
          border: none;
          cursor: pointer;
          font-family: ${F};
          font-size: 13.5px;
          font-weight: 700;
          color: #fff;
          text-decoration: underline;
        }

        /* Desktop: text left / photo right — fixed readability, no overlay crop lottery */
        @media (min-width: 900px) {
          .mm-hero {
            display: grid;
            grid-template-columns: minmax(320px, 1fr) minmax(360px, 1.05fr);
            align-items: stretch;
            min-height: min(100dvh, 820px);
            max-height: none;
            background:
              radial-gradient(120% 80% at 0% 100%, ${T.accentSoft} 0%, transparent 55%),
              linear-gradient(165deg, #FFF9F6 0%, ${T.bg} 48%, #F3E8E4 100%);
          }
          .mm-hero-media {
            position: relative;
            inset: auto;
            min-height: 100%;
            order: 2;
          }
          .mm-hero-img {
            object-position: center 20%;
          }
          .mm-hero-scrim {
            display: none;
          }
          .mm-hero-copy {
            order: 1;
            max-width: none;
            width: auto;
            margin: 0;
            padding: clamp(40px, 6vw, 72px) clamp(32px, 4vw, 64px);
            display: flex;
            flex-direction: column;
            justify-content: center;
            color: ${T.ink};
          }
          .mm-hero-brand {
            font-size: clamp(42px, 4.2vw, 56px);
            color: ${T.ink};
          }
          .mm-hero-kicker {
            color: ${T.accentDeep};
          }
          .mm-hero-headline {
            font-size: clamp(30px, 3.2vw, 40px);
            color: ${T.ink};
          }
          .mm-hero-accent {
            color: ${T.accent};
          }
          .mm-hero-lede {
            color: ${T.inkSoft};
            max-width: 34ch;
          }
          .mm-hero-cta > button {
            background: ${T.accent} !important;
            color: #fff !important;
            max-width: 360px;
          }
          .mm-hero-cta-note {
            text-align: left;
            color: ${T.inkSoft};
            max-width: 360px;
          }
          .mm-hero-signin-wrap {
            text-align: left !important;
          }
          .mm-hero-signin {
            color: ${T.accentDeep};
          }
        }

      `}</style>

      <section className="mm-hero">
        <div className="mm-hero-media">
          <img
            className="mm-hero-img"
            src={heroImg}
            alt="Callie outdoors with her baby"
            width={1600}
            height={2133}
            decoding="async"
          />
          <div className="mm-hero-scrim" aria-hidden />
        </div>

        <div className="mm-hero-copy">
          <div>
            <div className="mm-hero-brand">Macros and Mamas</div>
            <div className="mm-hero-kicker">ranges, not rules</div>
            <h1 className="mm-hero-headline">
              Lose the weight.<br />
              Keep the muscle.<br />
              <span className="mm-hero-accent">Eat like a mother.</span>
            </h1>
            <p className="mm-hero-lede">
              An 8-week macro program for moms — personalized ranges, real food, and Callie in your pocket all week.
            </p>
          </div>

          <div className="mm-hero-cta">
            <Btn
              onClick={onStartIntake}
              style={{ width: "100%", background: "#fff", color: T.accentDeep }}
            >
              Join the founding group by July 27 — $149
            </Btn>
            <div className="mm-hero-cta-note">
              Price goes to $299 after the founding group fills
            </div>
            {onSignIn && (
              <div className="mm-hero-signin-wrap" style={{ textAlign: "center", marginTop: 14 }}>
                <button type="button" onClick={onSignIn} className="mm-hero-signin">
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

        <section style={{ marginTop: 28, marginBottom: 8 }}>
          <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 24, margin: "0 0 14px" }}>Meet Callie</h2>
          <img
            src="/callie-about.jpg"
            alt="Callie, founder of Macros and Mamas"
            width={1200}
            height={799}
            loading="lazy"
            decoding="async"
            style={{
              width: "100%",
              height: "auto",
              display: "block",
              borderRadius: 4,
              marginBottom: 16,
              objectFit: "cover",
              aspectRatio: "3 / 2",
            }}
          />
          <p style={{ fontSize: 15, lineHeight: 1.65, color: T.ink, margin: 0 }}>
            Hi, I&apos;m Callie — certified holistic nutritionist, blood chemistry certified, and a mama in the thick of it myself. I&apos;ve spent years helping women fix their energy, hormones, and gut by looking at what the data actually says instead of what diet culture yells. Macros and Mamas is everything I do with my 1:1 clients, built for postpartum. Ranges, not rules — because I will never hand you a 1,200-calorie plan and call it help.
          </p>
        </section>

        <div style={{
          marginTop: 22, padding: "16px 0",
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
            Moms ready to lose the weight and build strength — whether your baby is three months or sixteen years. Breastfeeding mamas are welcome from three months postpartum (your macros are set gently; supply comes first).{" "}
            <span style={{ fontWeight: 700, color: T.accentDeep }}>
              Not for pregnancy or the first three months of nursing.
            </span>
          </div>
        </div>

        <div style={{ margin: "22px 0 6px" }}>
          <Btn onClick={onStartIntake} style={{ width: "100%" }}>Join the founding group by July 27 — $149</Btn>
          <div style={{ textAlign: "center", fontSize: 12.5, color: T.inkSoft, marginTop: 8, lineHeight: 1.45 }}>
            Price goes to $299 after the founding group fills
          </div>
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
