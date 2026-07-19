import { useState } from "react";
import { FD, T } from "../theme/tokens";
import { Shell, Card, Btn, Field, inputStyle } from "../components/ui";
import { useAuth } from "../auth/useAuth.jsx";

export function SignInPage({ onBack, title = "Sign in to continue" }) {
  const { signInWithPassword, signUpWithPassword, signInWithEmail } = useAuth();
  const [mode, setMode] = useState("signin"); // signin | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [magicSent, setMagicSent] = useState(false);
  const [showMagic, setShowMagic] = useState(false);

  const submitPassword = async () => {
    if (!email.trim() || !password) return;
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    setError("");
    setInfo("");
    if (mode === "signin") {
      const { error: err } = await signInWithPassword(email, password);
      setBusy(false);
      if (err) setError(err.message || "Could not sign in.");
      return;
    }
    const { error: err, needsEmailConfirm } = await signUpWithPassword(email, password);
    setBusy(false);
    if (err) {
      setError(err.message || "Could not create account.");
      return;
    }
    if (needsEmailConfirm) {
      setInfo("Check your email to confirm your account, then sign in. (Or ask your admin to turn off “Confirm email” in Supabase until custom SMTP is set up.)");
    }
  };

  const submitMagic = async () => {
    if (!email.trim()) return;
    setBusy(true);
    setError("");
    setInfo("");
    const { error: err } = await signInWithEmail(email);
    setBusy(false);
    if (err) {
      setError(err.message || "Could not send the magic link.");
      return;
    }
    setMagicSent(true);
  };

  return (
    <Shell>
      <Card style={{ marginTop: 24, padding: 28 }}>
        <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "0 0 8px" }}>{title}</h2>
        <p style={{ fontSize: 14.5, lineHeight: 1.55, color: T.inkSoft, margin: "0 0 18px" }}>
          Use the same email every time so Callie can find your macros.
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => { setMode("signin"); setError(""); setInfo(""); }}
            style={{
              flex: 1, padding: "10px 12px", borderRadius: 999, cursor: "pointer", fontWeight: 700, fontSize: 13,
              border: `1.5px solid ${mode === "signin" ? T.accent : T.border}`,
              background: mode === "signin" ? T.accentSoft : "#fff",
              color: mode === "signin" ? T.accentDeep : T.inkSoft,
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => { setMode("signup"); setError(""); setInfo(""); }}
            style={{
              flex: 1, padding: "10px 12px", borderRadius: 999, cursor: "pointer", fontWeight: 700, fontSize: 13,
              border: `1.5px solid ${mode === "signup" ? T.accent : T.border}`,
              background: mode === "signup" ? T.accentSoft : "#fff",
              color: mode === "signup" ? T.accentDeep : T.inkSoft,
            }}
          >
            Create account
          </button>
        </div>

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
        <Field label="Password">
          <input
            style={inputStyle}
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            onKeyDown={(e) => { if (e.key === "Enter") submitPassword(); }}
          />
        </Field>

        {error && (
          <div style={{ background: T.amberSoft, borderRadius: 12, padding: "10px 14px", marginBottom: 12, fontSize: 13.5, color: T.amber, lineHeight: 1.5 }}>
            {error}
          </div>
        )}
        {info && (
          <div style={{ background: T.sageSoft, borderRadius: 12, padding: "10px 14px", marginBottom: 12, fontSize: 13.5, color: "#3E5A46", lineHeight: 1.5 }}>
            {info}
          </div>
        )}

        <Btn
          style={{ width: "100%" }}
          disabled={busy || !email.trim() || !password}
          onClick={submitPassword}
        >
          {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
        </Btn>

        <div style={{ marginTop: 18, borderTop: `1px dashed ${T.border}`, paddingTop: 14 }}>
          <button
            type="button"
            onClick={() => setShowMagic((v) => !v)}
            style={{
              background: "none", border: "none", padding: 0, cursor: "pointer",
              fontSize: 13, fontWeight: 700, color: T.inkSoft, textDecoration: "underline",
            }}
          >
            {showMagic ? "Hide magic link" : "Prefer a magic link instead?"}
          </button>

          {showMagic && (
            <div style={{ marginTop: 12 }}>
              <p style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.5, margin: "0 0 10px" }}>
                Magic links use email. Supabase’s free mailer only allows a couple per hour — password sign-in is more reliable.
              </p>
              {magicSent ? (
                <div style={{ background: T.sageSoft, borderRadius: 12, padding: "12px 14px", fontSize: 13.5, color: "#3E5A46", lineHeight: 1.5 }}>
                  Check <b>{email.trim()}</b> for your sign-in link.
                </div>
              ) : (
                <Btn ghost style={{ width: "100%" }} disabled={busy || !email.trim()} onClick={submitMagic}>
                  {busy ? "Sending…" : "Email me a magic link"}
                </Btn>
              )}
            </div>
          )}
        </div>

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
