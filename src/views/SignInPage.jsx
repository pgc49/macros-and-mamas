import { useState } from "react";
import { FD, T } from "../theme/tokens";
import { Shell, Card, Btn, Field, inputStyle } from "../components/ui";
import { useAuth } from "../auth/useAuth.jsx";

export function SignInPage({ onBack, title = "Sign in to continue" }) {
  const { signInWithEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!email.trim()) return;
    setBusy(true);
    setError("");
    const { error: err } = await signInWithEmail(email);
    setBusy(false);
    if (err) {
      setError(err.message || "Could not send the magic link.");
      return;
    }
    setSent(true);
  };

  return (
    <Shell>
      <Card style={{ marginTop: 24, padding: 28 }}>
        <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "0 0 8px" }}>{title}</h2>
        <p style={{ fontSize: 14.5, lineHeight: 1.55, color: T.inkSoft, margin: "0 0 18px" }}>
          Enter your email and we'll send a magic link — no password. Use the same email every time so Callie can find your macros.
        </p>

        {sent ? (
          <div style={{ background: T.sageSoft, borderRadius: 12, padding: "14px 16px", fontSize: 14, lineHeight: 1.55, color: "#3E5A46" }}>
            Check <b>{email.trim()}</b> for your sign-in link. You can close this tab after you click it.
          </div>
        ) : (
          <>
            <Field label="Email">
              <input
                style={inputStyle}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
              />
            </Field>
            {error && (
              <div style={{ background: T.amberSoft, borderRadius: 12, padding: "10px 14px", marginBottom: 12, fontSize: 13.5, color: T.amber, lineHeight: 1.5 }}>
                {error}
              </div>
            )}
            <Btn style={{ width: "100%" }} disabled={busy || !email.trim()} onClick={submit}>
              {busy ? "Sending…" : "Email me a magic link"}
            </Btn>
          </>
        )}

        {onBack && (
          <button
            onClick={onBack}
            style={{
              display: "block", margin: "16px auto 0", background: "none", border: "none",
              color: T.accent, fontWeight: 700, fontSize: 14, cursor: "pointer", textDecoration: "underline",
            }}
          >
            Back
          </button>
        )}
      </Card>
    </Shell>
  );
}
