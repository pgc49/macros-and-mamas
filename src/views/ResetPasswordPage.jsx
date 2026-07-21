import { useState } from "react";
import { FD, T } from "../theme/tokens";
import { Shell, Card, Btn, Field, inputStyle } from "../components/ui";
import { useAuth } from "../auth/useAuth.jsx";
import { PATHS } from "../routing";
import { useNavigate } from "react-router-dom";

/** Set a new password after clicking the Supabase recovery email link. */
export function ResetPasswordPage() {
  const { user, updatePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don’t match.");
      return;
    }
    if (!user) {
      setError("This reset link expired or already used. Request a new one from Sign in.");
      return;
    }
    setBusy(true);
    setError("");
    const { error: err } = await updatePassword(password);
    setBusy(false);
    if (err) {
      setError(err.message || "Could not update password.");
      return;
    }
    setDone(true);
  };

  return (
    <Shell>
      <Card style={{ marginTop: 24, padding: 28 }}>
        <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "0 0 8px" }}>
          {done ? "Password updated" : "Choose a new password"}
        </h2>
        <p style={{ fontSize: 14.5, lineHeight: 1.55, color: T.inkSoft, margin: "0 0 18px" }}>
          {done
            ? "You’re all set. Sign in with your new password anytime."
            : "Enter a new password for your Macros and Mamas account."}
        </p>

        {!done && (
          <>
            <Field label="New password">
              <input
                style={inputStyle}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
              />
            </Field>
            <Field label="Confirm password">
              <input
                style={inputStyle}
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat password"
                onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              />
            </Field>

            {error && (
              <div style={{ background: T.amberSoft, borderRadius: 12, padding: "10px 14px", marginBottom: 12, fontSize: 13.5, color: T.amber, lineHeight: 1.5 }}>
                {error}
              </div>
            )}

            <Btn
              style={{ width: "100%" }}
              disabled={busy || !password || !confirm}
              onClick={submit}
            >
              {busy ? "Saving…" : "Save new password"}
            </Btn>
          </>
        )}

        {done && (
          <Btn style={{ width: "100%" }} onClick={() => navigate(PATHS.home, { replace: true })}>
            Continue to app
          </Btn>
        )}

        {!done && !user && (
          <button
            type="button"
            onClick={() => navigate(PATHS.signin)}
            style={{
              display: "block", margin: "16px auto 0", background: "none", border: "none",
              color: T.accent, fontWeight: 700, fontSize: 14, cursor: "pointer", textDecoration: "underline",
            }}
          >
            Back to sign in
          </button>
        )}
      </Card>
    </Shell>
  );
}
