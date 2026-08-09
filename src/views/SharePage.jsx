import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { FD, F, T } from "../theme/tokens";
import { Shell, Card, Btn } from "../components/ui";
import { PATHS } from "../routing";
import { useAuth } from "../auth/useAuth.jsx";
import { supabase } from "../lib/supabase";

function moneyCents(cents) {
  const n = Number(cents) || 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n / 100);
}

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Sign in again.");
  return { authorization: `Bearer ${token}` };
}

/** Account → Share Macros and Mamas — code, blurb, tally. */
export function SharePage() {
  const { user, profile, loading: authLoading, isAdmin } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (authLoading || !user) {
        if (!authLoading) setLoading(false);
        return;
      }
      try {
        const headers = await authHeaders();
        const resp = await fetch("/api/referrals", { headers });
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(json.error || "Couldn't load share details.");
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setErr(e?.message || "Couldn't load share details.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, authLoading]);

  const copy = async (key, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(""), 1600);
    } catch (e) {
      console.error("clipboard failed", e);
      setErr("Couldn't copy — long-press to select instead.");
    }
  };

  if (authLoading || loading) {
    return (
      <Shell>
        <Card style={{ marginTop: 24 }}>
          <div style={{ fontFamily: FD, fontSize: 20, color: T.inkSoft }}>Loading…</div>
        </Card>
      </Shell>
    );
  }

  if (!user) {
    return <Navigate to={PATHS.signin} replace state={{ from: PATHS.accountShare }} />;
  }
  if (profile?.refunded) return <Navigate to={PATHS.goodbye} replace />;
  if (!profile?.paid && !isAdmin) return <Navigate to={PATHS.join} replace />;

  return (
    <Shell>
      <div style={{ marginTop: 18, marginBottom: 8 }}>
        <Link
          to={PATHS.account}
          style={{ fontSize: 13, fontWeight: 700, color: T.accent, textDecoration: "underline" }}
        >
          ← Account
        </Link>
      </div>
      <h1 style={{ fontFamily: FD, fontWeight: 400, fontSize: 28, margin: "8px 0 6px" }}>
        Share Macros and Mamas
      </h1>
      <p style={{ fontSize: 14.5, color: T.inkSoft, margin: "0 0 18px", lineHeight: 1.5 }}>
        Friends save $25 on the quiz rate. You earn a $25 credit after they enroll (vests in {data?.vestingDays ?? 3} days).
      </p>

      {err && (
        <Card style={{ marginBottom: 14, background: T.accentSoft, border: "none" }}>
          <div style={{ fontSize: 14, color: T.accentDeep }}>{err}</div>
        </Card>
      )}

      {data && (
        <>
          <Card style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: T.inkSoft }}>
              Your code
            </div>
            <div style={{ fontFamily: FD, fontSize: 32, marginTop: 6, letterSpacing: 1 }}>
              {data.code}
            </div>
            <Btn
              style={{ width: "100%", marginTop: 14 }}
              onClick={() => copy("code", data.code)}
            >
              {copied === "code" ? "Copied" : "Copy code"}
            </Btn>
          </Card>

          <Card style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: T.inkSoft }}>
              Share text
            </div>
            <p style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.5, margin: "8px 0 0" }}>
              Feel free to personalize this copy when sharing with friends or mom groups.
            </p>
            <p style={{ fontSize: 14.5, lineHeight: 1.55, margin: "10px 0 0", color: T.ink, fontFamily: F }}>
              {data.blurb}
            </p>
            <Btn
              style={{ width: "100%", marginTop: 14 }}
              onClick={() => copy("blurb", data.blurb)}
            >
              {copied === "blurb" ? "Copied" : "Copy message"}
            </Btn>
          </Card>

          <Card style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: T.inkSoft }}>
              Your tally
            </div>
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 12 }}>
              <div>
                <div style={{ fontFamily: FD, fontSize: 26 }}>{data.friendsEnrolled}</div>
                <div style={{ fontSize: 13, color: T.inkSoft }}>friends enrolled</div>
              </div>
              <div>
                <div style={{ fontFamily: FD, fontSize: 26 }}>{moneyCents(data.availableCents)}</div>
                <div style={{ fontSize: 13, color: T.inkSoft }}>available</div>
              </div>
              <div>
                <div style={{ fontFamily: FD, fontSize: 26 }}>{moneyCents(data.pendingCents)}</div>
                <div style={{ fontSize: 13, color: T.inkSoft }}>pending</div>
              </div>
            </div>
            {data.ambassador && (
              <div style={{ marginTop: 12, fontSize: 13.5, color: T.sage, fontWeight: 700 }}>
                Ambassador — Callie will follow up about your $100 thank-you.
              </div>
            )}
            <p style={{ fontSize: 13, color: T.inkSoft, margin: "12px 0 0", lineHeight: 1.5 }}>
              Credits show on Payments and apply automatically to membership or a Lab Review invoice.
            </p>
          </Card>
        </>
      )}
    </Shell>
  );
}
