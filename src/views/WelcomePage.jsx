import { useEffect, useRef, useState } from "react";
import { FD, T } from "../theme/tokens";
import { Shell, Card, Btn } from "../components/ui";
import { db } from "../db/db";
import { PATHS } from "../routing";

/**
 * Stripe success landing. Never trust the URL alone — poll until webhook
 * flips profiles.paid, then send them into intake.
 */
export function WelcomePage({ onPaid, navigate }) {
  const [status, setStatus] = useState("confirming"); // confirming | ready | stuck
  const [tries, setTries] = useState(0);
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;

  useEffect(() => {
    let cancelled = false;
    let attempt = 0;
    const maxAttempts = 20;
    let timer;

    const tick = async () => {
      attempt += 1;
      if (!cancelled) setTries(attempt);
      try {
        const s = await db.loadClientState();
        if (cancelled) return;
        if (s?.refunded) {
          navigate(PATHS.goodbye, { replace: true });
          return;
        }
        if (s?.paid) {
          setStatus("ready");
          onPaidRef.current?.(s);
          return;
        }
      } catch (e) {
        console.error("welcome poll failed", e);
      }
      if (attempt >= maxAttempts) {
        if (!cancelled) setStatus("stuck");
        return;
      }
      if (!cancelled) {
        timer = window.setTimeout(tick, 1500);
      }
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [navigate]);

  return (
    <Shell>
      <Card style={{ marginTop: 30, textAlign: "center", padding: 30 }}>
        {status === "confirming" && (
          <>
            <div style={{ fontSize: 34 }}>⏳</div>
            <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "10px 0" }}>
              Confirming your payment…
            </h2>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: T.inkSoft }}>
              Hang tight — this usually takes just a few seconds.
              {tries > 3 ? " Still finishing up…" : ""}
            </p>
          </>
        )}
        {status === "ready" && (
          <>
            <div style={{ fontSize: 34 }}>💌</div>
            <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "10px 0" }}>
              You&apos;re in, mama — let&apos;s build your macros
            </h2>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: T.inkSoft }}>
              Next up: a short intake so Callie can personalize your ranges.
            </p>
            <Btn style={{ width: "100%", marginTop: 8 }} onClick={() => navigate(PATHS.onboarding)}>
              Start my intake
            </Btn>
          </>
        )}
        {status === "stuck" && (
          <>
            <div style={{ fontSize: 34 }}>🤍</div>
            <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "10px 0" }}>
              Still confirming…
            </h2>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: T.inkSoft }}>
              Payment can take a moment to land. Tap refresh, or check back in a minute — you&apos;re not charged twice.
            </p>
            <Btn
              style={{ width: "100%", marginTop: 8 }}
              onClick={() => window.location.reload()}
            >
              Refresh
            </Btn>
          </>
        )}
      </Card>
    </Shell>
  );
}
