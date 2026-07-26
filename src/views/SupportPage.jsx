import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { FD, F, T } from "../theme/tokens";
import { Shell, Card, Btn } from "../components/ui";
import { PATHS } from "../routing";
import { useAuth } from "../auth/useAuth.jsx";
import { supabase } from "../lib/supabase";

const MAX_SHOT_BYTES = 3.5 * 1024 * 1024;

/**
 * Public tech/support form — WhatsApp link: https://www.macrosandmamas.com/support
 * Posts to /api/support → private GitHub issue (Patrick triage). Not Callie's DMs.
 */
export function SupportPage() {
  const { user } = useAuth();
  const location = useLocation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState(() => user?.email || "");
  const [message, setMessage] = useState("");
  const [screenshot, setScreenshot] = useState(null);
  const [shotName, setShotName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const fieldStyle = {
    width: "100%",
    boxSizing: "border-box",
    padding: "12px 14px",
    borderRadius: 10,
    border: `1.5px solid ${T.border}`,
    background: "#fff",
    color: T.ink,
    fontFamily: F,
    fontSize: 15,
    outline: "none",
  };

  const labelStyle = {
    display: "block",
    fontSize: 12.5,
    fontWeight: 700,
    letterSpacing: "0.02em",
    marginBottom: 5,
    color: T.inkSoft,
  };

  const onFile = async (e) => {
    setError("");
    const file = e.target.files?.[0];
    if (!file) {
      setScreenshot(null);
      setShotName("");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Please attach a screenshot image (JPG or PNG).");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_SHOT_BYTES) {
      setError("That image is a bit large — try a smaller crop or screenshot.");
      e.target.value = "";
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    setScreenshot(dataUrl);
    setShotName(file.name);
  };

  const submit = async (ev) => {
    ev.preventDefault();
    if (busy) return;
    setError("");
    const em = (email || user?.email || "").trim().toLowerCase();
    const msg = message.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      setError("Please enter the email you use for Macros and Mamas.");
      return;
    }
    if (msg.length < 10) {
      setError("A sentence or two about what you saw helps Patrick fix it faster.");
      return;
    }
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = { "content-type": "application/json" };
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
      const resp = await fetch("/api/support", {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: name.trim() || undefined,
          email: em,
          message: msg,
          route: `${location.pathname}${location.search || ""}`,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
          appVersion: import.meta.env.MODE || "web",
          screenshot: screenshot || undefined,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.status === 429) {
        setError(data.message || "You've sent a few reports today — try again tomorrow, or text Callie if urgent.");
        return;
      }
      if (!resp.ok) {
        setError(data.message || data.error || "Couldn't send that — try again in a moment.");
        return;
      }
      setDone(true);
    } catch (err) {
      console.error("support submit failed", err);
      setError("Couldn't reach support — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <Card style={{ marginTop: 24, padding: 28 }}>
        <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 700, color: T.accentDeep, letterSpacing: "0.02em" }}>
          Tech help
        </p>
        <h1 style={{ fontFamily: FD, fontWeight: 400, fontSize: 28, margin: "0 0 10px", lineHeight: 1.2 }}>
          Something weird in the app?
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.55, color: T.inkSoft, margin: "0 0 20px" }}>
          Tell Patrick (our tech guy) here — Callie&apos;s WhatsApp stays for coaching.
          A screenshot of the error helps a lot.
        </p>

        {done ? (
          <div style={{
            background: T.sageSoft,
            borderRadius: 12,
            padding: 16,
            fontSize: 15,
            lineHeight: 1.55,
            color: T.ink,
          }}
          >
            <div style={{ fontFamily: FD, fontSize: 20, marginBottom: 6 }}>Got it</div>
            Patrick will take a look. Thanks for flagging it — you can close this tab.
          </div>
        ) : (
          <form onSubmit={submit}>
            {!user?.email && (
              <>
                <label style={labelStyle} htmlFor="support-name">Name (optional)</label>
                <input
                  id="support-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{ ...fieldStyle, marginBottom: 14 }}
                  autoComplete="name"
                />
              </>
            )}

            <label style={labelStyle} htmlFor="support-email">Email</label>
            <input
              id="support-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ ...fieldStyle, marginBottom: 14 }}
              autoComplete="email"
              required
              readOnly={!!user?.email}
            />

            <label style={labelStyle} htmlFor="support-message">What happened?</label>
            <textarea
              id="support-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              placeholder="e.g. Plan my week showed a blank screen after I opened shopping list…"
              style={{ ...fieldStyle, marginBottom: 14, resize: "vertical", minHeight: 120 }}
              required
            />

            <label style={labelStyle} htmlFor="support-shot">Screenshot (optional)</label>
            <input
              id="support-shot"
              type="file"
              accept="image/*"
              onChange={onFile}
              style={{ marginBottom: 6, fontFamily: F, fontSize: 14 }}
            />
            {shotName && (
              <div style={{ fontSize: 12.5, color: T.sage, marginBottom: 14 }}>
                Attached: {shotName}
              </div>
            )}
            {!shotName && <div style={{ height: 14 }} />}

            {error && (
              <div style={{
                background: T.amberSoft,
                borderRadius: 10,
                padding: "10px 12px",
                fontSize: 13.5,
                color: T.ink,
                marginBottom: 14,
                lineHeight: 1.45,
              }}
              >
                {error}
              </div>
            )}

            <Btn type="submit" disabled={busy} style={{ width: "100%" }}>
              {busy ? "Sending…" : "Send to Patrick"}
            </Btn>
          </form>
        )}

        <p style={{ margin: "18px 0 0", fontSize: 13.5, color: T.inkSoft, lineHeight: 1.5 }}>
          <Link to={PATHS.home} style={{ color: T.accent, fontWeight: 700, textDecoration: "underline" }}>
            ← Back to home
          </Link>
          {" · "}
          <Link to={PATHS.dashboard} style={{ color: T.accent, fontWeight: 700, textDecoration: "underline" }}>
            Open app
          </Link>
        </p>
      </Card>
    </Shell>
  );
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
