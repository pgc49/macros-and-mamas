import { useEffect, useRef, useState } from "react";
import { FD, T } from "../theme/tokens";
import { Shell, Card, Btn } from "../components/ui";
import { db } from "../db/db";
import { PATHS } from "../routing";
import { trackPixel } from "../lib/attribution";
import { purchaseEventIdFromWelcomeSearch } from "../lib/purchaseEventId";
import { welcomeCheckoutDecision } from "../lib/welcomeCheckout";

/**
 * Stripe success landing. Never trust the URL alone — poll until webhook
 * flips profiles.paid, then send them into intake.
 * Unpaid + no session_id is a leftover bookmark, not a checkout return.
 */
export function WelcomePage({ onPaid, navigate, paid = false }) {
  const [status, setStatus] = useState("confirming"); // confirming | ready | stuck
  const [tries, setTries] = useState(0);
  const onPaidRef = useRef(onPaid);
  const purchaseTracked = useRef(false);
  onPaidRef.current = onPaid;
  const decision = welcomeCheckoutDecision({
    paid,
    search: typeof window !== "undefined" ? window.location.search : "",
  });

  useEffect(() => {
    if (decision !== "join") return undefined;
    navigate(PATHS.join, { replace: true });
    return undefined;
  }, [decision, navigate]);

  useEffect(() => {
    if (decision === "join") return undefined;
    let cancelled = false;
    let attempt = 0;
    const maxAttempts = 20;
    let timer;

    const firePurchasePixel = () => {
      if (purchaseTracked.current) return;
      const sessionId = purchaseEventIdFromWelcomeSearch(window.location.search);
      if (!sessionId) return;
      try {
        const firedKey = `mm_purchase_pixel_${sessionId}`;
        if (sessionStorage.getItem(firedKey)) {
          purchaseTracked.current = true;
          return;
        }
        sessionStorage.setItem(firedKey, "1");
      } catch {
        /* private mode — still fire once this mount */
      }
      purchaseTracked.current = true;
      trackPixel(
        "Purchase",
        { currency: "USD", content_name: "enrollment", order_id: sessionId },
        sessionId,
      );
    };

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
          firePurchasePixel();
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
  }, [navigate, decision]);

  if (decision === "join") return null;

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
