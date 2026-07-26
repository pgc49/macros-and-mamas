import { useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { FD, F, T } from "../theme/tokens";
import { Shell, Card, Btn } from "../components/ui";
import { PATHS } from "../routing";
import { useAuth } from "../auth/useAuth.jsx";
import { supabase } from "../lib/supabase";

const MAX_FILES = 4;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const IMAGE_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif",
]);
const VIDEO_TYPES = new Set([
  "video/mp4", "video/quicktime", "video/webm", "video/x-m4v",
]);

/**
 * Signed-in tech/support form.
 * WhatsApp link: https://www.macrosandmamas.com/support (prompts sign-in).
 * Posts to /api/support → private GitHub issue with profile id + media.
 */
export function SupportPage() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState([]);
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

  if (loading) {
    return (
      <Shell>
        <Card style={{ marginTop: 24, padding: 28 }}>
          <div style={{ fontFamily: FD, fontSize: 20, color: T.inkSoft }}>Loading…</div>
        </Card>
      </Shell>
    );
  }

  if (!user) {
    return <Navigate to={PATHS.signin} replace state={{ from: PATHS.support }} />;
  }

  const onFiles = (e) => {
    setError("");
    const picked = Array.from(e.target.files || []);
    if (!picked.length) {
      setFiles([]);
      return;
    }
    const next = [];
    for (const file of picked) {
      const isImage = IMAGE_TYPES.has(file.type) || file.type.startsWith("image/");
      const isVideo = VIDEO_TYPES.has(file.type) || file.type.startsWith("video/");
      if (!isImage && !isVideo) {
        setError("Attach screenshots (JPG/PNG) or a screen recording (MP4/MOV/WebM).");
        e.target.value = "";
        return;
      }
      const max = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
      if (file.size > max) {
        setError(
          isVideo
            ? "That recording is over 50 MB — try a shorter clip."
            : "That image is a bit large — try a smaller crop.",
        );
        e.target.value = "";
        return;
      }
      next.push(file);
    }
    if (next.length > MAX_FILES) {
      setError(`You can attach up to ${MAX_FILES} files.`);
      e.target.value = "";
      return;
    }
    setFiles(next);
  };

  const submit = async (ev) => {
    ev.preventDefault();
    if (busy) return;
    setError("");
    const msg = message.trim();
    if (msg.length < 10) {
      setError("A sentence or two about what you saw helps Tech Guy fix it faster.");
      return;
    }
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token || !session.user?.id) {
        setError("Please sign in again, then resend.");
        return;
      }

      const attachments = [];
      for (const file of files) {
        const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "clip";
        const path = `${session.user.id}/${Date.now()}-${safe}`;
        const { error: upErr } = await supabase.storage
          .from("support-screenshots")
          .upload(path, file, {
            contentType: file.type || undefined,
            upsert: false,
          });
        if (upErr) {
          console.error("support media upload failed", upErr);
          setError("Couldn't upload that attachment — try a smaller file, or send without media.");
          return;
        }
        attachments.push({
          path,
          name: file.name,
          mime: file.type,
          kind: file.type.startsWith("video/") ? "video" : "image",
        });
      }

      const resp = await fetch("/api/support", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          message: msg,
          route: `${location.pathname}${location.search || ""}`,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
          appVersion: import.meta.env.MODE || "web",
          attachments,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.status === 401) {
        setError("Please sign in again, then resend.");
        return;
      }
      if (resp.status === 429) {
        setError(data.message || "You've sent a few reports today — try again tomorrow, or text Callie if urgent.");
        return;
      }
      if (!resp.ok) {
        const detail = data.reason ? ` (${data.reason})` : "";
        setError((data.message || data.error || "Couldn't send that — try again in a moment.") + detail);
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
        <p style={{ fontSize: 15, lineHeight: 1.55, color: T.inkSoft, margin: "0 0 8px" }}>
          Tell Tech Guy here — Callie&apos;s WhatsApp stays for coaching.
          Screenshots or a short screen recording help a lot.
        </p>
        <p style={{ fontSize: 13.5, color: T.inkSoft, margin: "0 0 20px" }}>
          Signed in as <b style={{ color: T.ink }}>{user.email}</b>
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
            Tech Guy will take a look. Thanks for flagging it.
          </div>
        ) : (
          <form onSubmit={submit}>
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

            <label style={labelStyle} htmlFor="support-files">
              Screenshots or screen recording (optional, up to {MAX_FILES})
            </label>
            <input
              id="support-files"
              type="file"
              accept="image/*,video/mp4,video/quicktime,video/webm,.mov,.mp4"
              multiple
              onChange={onFiles}
              style={{ marginBottom: 6, fontFamily: F, fontSize: 14 }}
            />
            {files.length > 0 ? (
              <ul style={{ margin: "0 0 14px", paddingLeft: 18, fontSize: 12.5, color: T.sage, lineHeight: 1.45 }}>
                {files.map((f) => (
                  <li key={`${f.name}-${f.size}`}>
                    {f.type.startsWith("video/") ? "Recording" : "Screenshot"}: {f.name}
                    {" "}({Math.max(1, Math.round(f.size / 1024))} KB)
                  </li>
                ))}
              </ul>
            ) : (
              <div style={{ height: 14 }} />
            )}

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
              {busy ? "Sending…" : "Send to Tech Guy"}
            </Btn>
          </form>
        )}

        <p style={{ margin: "18px 0 0", fontSize: 13.5, color: T.inkSoft, lineHeight: 1.5 }}>
          <Link to={PATHS.dashboard} style={{ color: T.accent, fontWeight: 700, textDecoration: "underline" }}>
            ← Back to app
          </Link>
        </p>
      </Card>
    </Shell>
  );
}
