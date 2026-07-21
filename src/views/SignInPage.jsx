import { useState } from "react";
import { Link } from "react-router-dom";
import { FD, T, F } from "../theme/tokens";
import { Shell, Card, Btn, Field, inputStyle } from "../components/ui";
import { useAuth } from "../auth/useAuth.jsx";
import { PATHS } from "../routing";
import { TERMS_VERSION } from "../content/terms";

/**
 * One auth screen. Mode comes from the entry point:
 * - create → Start intake / Join buttons
 * - signin → "Already enrolled? Sign in"
 */
export function SignInPage({
  onBack,
  mode = "signin", // "create" | "signin"
  onSwitchMode,
}) {
  const { signInWithPassword, signUpWithPassword, resetPasswordForEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [forgotMode, setForgotMode] = useState(false);

  const isCreate = mode === "create";

  const submit = async () => {
    if (!email.trim()) return;

    if (forgotMode) {
      setBusy(true);
      setError("");
      setInfo("");
      const { error: err } = await resetPasswordForEmail(email);
      setBusy(false);
      if (err) {
        setError(err.message || "Could not send reset email.");
        return;
      }
      setInfo("If an account exists for that email, you’ll get a reset link shortly. Check spam too.");
      return;
    }

    if (!password) return;
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (isCreate && !agreeTerms) {
      setError("Please agree to the Terms and Conditions to create your account.");
      return;
    }
    setBusy(true);
    setError("");
    setInfo("");

    if (isCreate) {
      const termsAcceptedAt = new Date().toISOString();
      const { error: err, needsEmailConfirm } = await signUpWithPassword(email, password, {
        termsAcceptedAt,
        termsVersion: TERMS_VERSION,
      });
      setBusy(false);
      if (err) {
        const msg = err.message || "Could not create account.";
        if (/already|registered|exists/i.test(msg) && onSwitchMode) {
          setError("That email already has an account. Sign in instead.");
          return;
        }
        setError(msg);
        return;
      }
      if (needsEmailConfirm) {
        setInfo("Check your email to confirm your account, then sign in. (Or turn off “Confirm email” in Supabase until custom SMTP is set up.)");
      }
      return;
    }

    const { error: err } = await signInWithPassword(email, password);
    setBusy(false);
    if (err) setError(err.message || "Could not sign in.");
  };

  return (
    <Shell>
      <Card style={{ marginTop: 24, padding: 28 }}>
        <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "0 0 8px" }}>
          {forgotMode ? "Reset your password" : isCreate ? "Create your account" : "Welcome back"}
        </h2>
        <p style={{ fontSize: 14.5, lineHeight: 1.55, color: T.inkSoft, margin: "0 0 18px" }}>
          {forgotMode
            ? "Enter the email you enrolled with. We’ll send a link to choose a new password."
            : isCreate
              ? "Create an account to join the founding group. Next you'll pay $149, then complete a short intake so Callie can build your macros."
              : "Sign in with the email you used when you enrolled."}
        </p>

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
        {!forgotMode && (
          <Field label="Password">
            <input
              style={inputStyle}
              type="password"
              autoComplete={isCreate ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            />
          </Field>
        )}

        {!isCreate && !forgotMode && (
          <div style={{ textAlign: "right", marginTop: -6, marginBottom: 14 }}>
            <button
              type="button"
              onClick={() => { setForgotMode(true); setError(""); setInfo(""); }}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 13, fontWeight: 700, color: T.accent, textDecoration: "underline" }}
            >
              Forgot password?
            </button>
          </div>
        )}

        {isCreate && !forgotMode && (
          <label
            style={{
              display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14,
              fontSize: 13.5, lineHeight: 1.45, color: T.ink, cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={agreeTerms}
              onChange={(e) => setAgreeTerms(e.target.checked)}
              style={{ marginTop: 3, width: 16, height: 16, accentColor: T.accent, flexShrink: 0 }}
            />
            <span>
              I agree to the{" "}
              <Link
                to={PATHS.terms}
                target="_blank"
                rel="noreferrer"
                style={{ fontFamily: F, fontWeight: 700, color: T.accent, textDecoration: "underline" }}
              >
                Terms and Conditions
              </Link>
              .
            </span>
          </label>
        )}

        {error && (
          <div style={{ background: T.amberSoft, borderRadius: 12, padding: "10px 14px", marginBottom: 12, fontSize: 13.5, color: T.amber, lineHeight: 1.5 }}>
            {error}
            {/already has an account/i.test(error) && onSwitchMode && (
              <>
                {" "}
                <button
                  type="button"
                  onClick={() => onSwitchMode("signin")}
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontWeight: 700, color: T.accent, textDecoration: "underline" }}
                >
                  Go to sign in
                </button>
              </>
            )}
          </div>
        )}
        {info && (
          <div style={{ background: T.sageSoft, borderRadius: 12, padding: "10px 14px", marginBottom: 12, fontSize: 13.5, color: "#3E5A46", lineHeight: 1.5 }}>
            {info}
          </div>
        )}

        <Btn
          style={{ width: "100%" }}
          disabled={busy || !email.trim() || (!forgotMode && !password) || (isCreate && !forgotMode && !agreeTerms)}
          onClick={submit}
        >
          {busy ? "Working…" : forgotMode ? "Send reset link" : isCreate ? "Create account" : "Sign in"}
        </Btn>

        {forgotMode && (
          <p style={{ textAlign: "center", fontSize: 13.5, color: T.inkSoft, margin: "16px 0 0" }}>
            <button
              type="button"
              onClick={() => { setForgotMode(false); setError(""); setInfo(""); }}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontWeight: 700, color: T.accent, textDecoration: "underline" }}
            >
              Back to sign in
            </button>
          </p>
        )}

        {onSwitchMode && !forgotMode && (
          <p style={{ textAlign: "center", fontSize: 13.5, color: T.inkSoft, margin: "16px 0 0" }}>
            {isCreate ? (
              <>
                Already enrolled?{" "}
                <button
                  type="button"
                  onClick={() => onSwitchMode("signin")}
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontWeight: 700, color: T.accent, textDecoration: "underline" }}
                >
                  Sign in
                </button>
              </>
            ) : (
              <>
                New here?{" "}
                <button
                  type="button"
                  onClick={() => onSwitchMode("create")}
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontWeight: 700, color: T.accent, textDecoration: "underline" }}
                >
                  Create an account
                </button>
              </>
            )}
          </p>
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
