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

        .mm-body {
          max-width: 560px;
          margin: 0 auto;
          padding: 28px 16px 90px;
        }
        .mm-section-title {
          font-family: ${FD};
          font-weight: 400;
          font-size: 24px;
          margin: 0 0 12px;
        }
        .mm-features {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .mm-feature {
          display: flex;
          gap: 14px;
          align-items: flex-start;
        }
        .mm-feature-icon {
          font-size: 24px;
          line-height: 1;
        }
        .mm-feature-title {
          font-family: ${FD};
          font-size: 17px;
          margin-bottom: 3px;
        }
        .mm-feature-body {
          font-size: 13.5px;
          color: ${T.inkSoft};
          line-height: 1.55;
        }
        .mm-meet {
          margin-top: 28px;
          margin-bottom: 8px;
        }
        .mm-meet-grid {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .mm-meet-img {
          width: 100%;
          height: auto;
          display: block;
          border-radius: 4px;
          object-fit: cover;
          aspect-ratio: 3 / 2;
        }
        .mm-meet-bio {
          font-size: 15px;
          line-height: 1.65;
          color: ${T.ink};
          margin: 0;
        }
        .mm-footer-cta {
          margin: 28px 0 6px;
        }
        .mm-footer-cta-note {
          text-align: center;
          font-size: 12.5px;
          color: ${T.inkSoft};
          margin-top: 8px;
          line-height: 1.45;
        }

        /* Desktop: shorter hero, wider body, real columns */
        @media (min-width: 900px) {
          .mm-hero {
            display: grid;
            grid-template-columns: minmax(340px, 0.95fr) minmax(380px, 1.05fr);
            align-items: stretch;
            min-height: 0;
            height: min(72vh, 620px);
            max-height: 620px;
            background:
              radial-gradient(120% 80% at 0% 100%, ${T.accentSoft} 0%, transparent 55%),
              linear-gradient(165deg, #FFF9F6 0%, ${T.bg} 48%, #F3E8E4 100%);
          }
          .mm-hero-media {
            position: relative;
            inset: auto;
            min-height: 100%;
            height: 100%;
            order: 2;
          }
          .mm-hero-img {
            object-position: center 22%;
          }
          .mm-hero-scrim {
            display: none;
          }
          .mm-hero-copy {
            order: 1;
            max-width: 440px;
            width: auto;
            margin: 0 auto 0 clamp(28px, 5vw, 72px);
            padding: 36px 28px 36px 0;
            display: flex;
            flex-direction: column;
            justify-content: center;
            color: ${T.ink};
          }
          .mm-hero-brand {
            font-size: clamp(36px, 3.6vw, 48px);
            color: ${T.ink};
            margin-bottom: 2px;
          }
          .mm-hero-kicker {
            color: ${T.accentDeep};
            margin-bottom: 14px;
          }
          .mm-hero-headline {
            font-size: clamp(26px, 2.8vw, 34px);
            color: ${T.ink};
            margin: 0 0 10px;
          }
          .mm-hero-accent {
            color: ${T.accent};
          }
          .mm-hero-lede {
            color: ${T.inkSoft};
            max-width: 38ch;
            margin: 0 0 16px;
            font-size: 15.5px;
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
            margin-top: 10px !important;
          }
          .mm-hero-signin {
            color: ${T.accentDeep};
          }

          .mm-body {
            max-width: 980px;
            padding: 40px 32px 72px;
          }
          .mm-section-title {
            font-size: 28px;
            margin: 0 0 18px;
          }
          .mm-features {
            display: grid;
            grid-template-columns: 1fr 1fr;
            column-gap: 28px;
            row-gap: 20px;
          }
          .mm-feature {
            gap: 12px;
          }
          .mm-meet {
            margin-top: 40px;
            margin-bottom: 12px;
          }
          .mm-meet-grid {
            display: grid;
            grid-template-columns: 1.05fr 1fr;
            gap: 28px;
            align-items: center;
          }
          .mm-meet-img {
            aspect-ratio: 4 / 3;
            margin: 0;
          }
          .mm-meet-bio {
            font-size: 16px;
            line-height: 1.7;
          }
          .mm-footer-cta {
            margin: 36px auto 6px;
            max-width: 420px;
          }
        }

        @media (min-width: 1200px) {
          .mm-hero {
            height: min(68vh, 580px);
            max-height: 580px;
          }
          .mm-body {
            max-width: 1040px;
            padding: 48px 40px 80px;
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

      <div className="mm-body">
        <h2 className="mm-section-title">What&apos;s inside</h2>
        <div className="mm-features">
          {FEATURES.map((f) => (
            <div key={f.title} className="mm-feature">
              <div className="mm-feature-icon">{f.icon}</div>
              <div>
                <div className="mm-feature-title">{f.title}</div>
                <div className="mm-feature-body">{f.body}</div>
              </div>
            </div>
          ))}
        </div>

        <section className="mm-meet">
          <h2 className="mm-section-title">Meet Callie</h2>
          <div className="mm-meet-grid">
            <img
              className="mm-meet-img"
              src="/callie-about.jpg"
              alt="Callie, founder of Macros and Mamas"
              width={1200}
              height={799}
              loading="lazy"
              decoding="async"
            />
            <p className="mm-meet-bio">
              Hi, I&apos;m Callie — certified holistic nutritionist, blood chemistry certified, and a mama in the thick of it myself. I&apos;ve spent years helping women fix their energy, hormones, and gut by looking at what the data actually says instead of what diet culture yells. Macros and Mamas is everything I do with my 1:1 clients, built for postpartum. Ranges, not rules — because I will never hand you a 1,200-calorie plan and call it help.
            </p>
          </div>
        </section>

        <div className="mm-footer-cta">
          <Btn onClick={onStartIntake} style={{ width: "100%" }}>Join the founding group by July 27 — $149</Btn>
          <div className="mm-footer-cta-note">
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
