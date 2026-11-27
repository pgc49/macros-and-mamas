import { useCallback, useMemo, useState } from "react";
import { PaymentsPage } from "./PaymentsPage";

const BENEFITS = [
  "Keep your macros, meal logging, and full progress history",
  "Alumni community chat with Callie and other grads",
  "Founding Mama rate: $49/mo locked in while you stay subscribed",
  "Q&A Library (monthly audio + weekly notes) as it rolls out",
];

const PROGRAM = {
  label: "8-week program",
  phase: "program_complete",
  cohortName: "August Group",
  programStart: "2026-08-31T00:00:00.000Z",
  programLastDay: "2026-10-25T00:00:00.000Z",
  amount: 249,
  currency: "usd",
};

/** Local-only billing summaries for /dev/payments. No Stripe calls. */
function billingFixture(mode) {
  const base = {
    program: PROGRAM,
    payments: [],
    portalAvailable: false,
  };
  if (mode === "ending") {
    return {
      ...base,
      subscription: {
        status: "active",
        priceLabel: "Monthly membership",
        amount: 49,
        currency: "usd",
        renewsAt: "2026-12-27T00:00:00.000Z",
        endsAt: "2026-12-27T00:00:00.000Z",
        cancelAtPeriodEnd: true,
        canCancel: false,
        canResume: true,
        canSubscribe: false,
        resubscribe: false,
        periodLabel: "Access through Dec 27, 2026",
        note: "This membership ends Dec 27, 2026. You keep access until then, and you won’t be charged again. You can turn it back on before then.",
        benefits: BENEFITS,
        priceConfigured: true,
      },
    };
  }
  if (mode === "ended") {
    return {
      ...base,
      subscription: {
        status: "required",
        priceLabel: "Monthly membership",
        amount: 49,
        currency: "usd",
        canCancel: false,
        canResume: false,
        canSubscribe: true,
        resubscribe: true,
        priceConfigured: true,
        note: "Your monthly membership has ended. Subscribe again to keep logging, your ranges, and Alumni chat.",
        benefits: BENEFITS,
      },
    };
  }
  return {
    ...base,
    portalAvailable: true,
    subscription: {
      status: "active",
      priceLabel: "Monthly membership",
      amount: 49,
      currency: "usd",
      renewsAt: "2026-12-27T00:00:00.000Z",
      cancelAtPeriodEnd: false,
      canCancel: true,
      canResume: false,
      canSubscribe: false,
      resubscribe: false,
      periodLabel: "Current period through Dec 27, 2026",
      note: "Your monthly membership is active.",
      benefits: BENEFITS,
      priceConfigured: true,
    },
  };
}

const MODES = [
  ["active", "Active"],
  ["ending", "Set to end"],
  ["ended", "Ended"],
];

/**
 * DEV-only Payments states. Production builds do not mount this route.
 */
export function PaymentsPreview() {
  const [mode, setMode] = useState("active");
  const summary = useMemo(() => billingFixture(mode), [mode]);
  const onCancel = useCallback(async () => {
    setMode("ending");
    return { subscription: billingFixture("ending").subscription };
  }, []);
  const onResume = useCallback(async () => {
    setMode("active");
    return { subscription: billingFixture("active").subscription };
  }, []);
  const onSubscribe = useCallback(async () => {
    return "This preview stops before Stripe. A real tap opens checkout.";
  }, []);
  const preview = useMemo(
    () => ({ summary, onCancel, onResume, onSubscribe }),
    [summary, onCancel, onResume, onSubscribe],
  );

  return (
    <>
      <div
        style={{
          display: "flex",
          gap: 8,
          justifyContent: "center",
          padding: "10px 12px",
          background: "#33272E",
        }}
      >
        {MODES.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            style={{
              border: 0,
              borderRadius: 999,
              padding: "6px 12px",
              fontWeight: 700,
              cursor: "pointer",
              background: mode === id ? "#fff" : "transparent",
              color: mode === id ? "#33272E" : "#fff",
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <PaymentsPage key={mode} preview={preview} />
    </>
  );
}
