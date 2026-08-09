import { useState } from "react";
import { Link, Navigate, useLocation, useSearchParams } from "react-router-dom";
import { FD, F, T } from "../theme/tokens";
import { Shell, Card, Btn } from "../components/ui";
import { PATHS } from "../routing";
import { useAuth } from "../auth/useAuth.jsx";
import { supabase } from "../lib/supabase";

function supportCopy({ fromAdmin, isAdmin, kind }) {
  if (fromAdmin || isAdmin) {
    return {
      eyebrow: "Coach → Tech Guy",
      title: "Feedback for Tech Guy",
      blurb: kind === "feedback"
        ? "Recipes, content, or product wishes — this opens a private GitHub issue tagged as Callie."
        : "Something broken in admin or the app — this opens a private GitHub issue tagged as Callie.",
    };
  }
  return {
    eyebrow: "Tech help",
    title: "App help & feedback",
    blurb: "Tell Tech Guy here — Callie's WhatsApp stays for coaching. Pick whether it's a bug or feedback so it lands in the right place.",
  };
}

const MAX_FILES = 4;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const IMAGE_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif",
]);
const VIDEO_TYPES = new Set([
  "video/mp4", "video/quicktime", "video/webm", "video/x-m4v",
]);

const KINDS = [
  {
    id: "bug",
    label: "There’s a bug or problem",
    hint: "Something broke, looks wrong, or won’t load.",
  },
  {
    id: "feedback",
    label: "Feedback / idea",
    hint: "A wish, suggestion, or what’s confusing — not broken.",
  },
];

/**
 * Signed-in tech/support form — bug reports or product feedback.
 * Posts to /api/support → private GitHub issue (labels: bug|feedback + from-app).
 */
export function SupportPage() {
  const { user, loading, isAdmin } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const initialKind = searchParams.get("kind") === "feedback" ? "feedback" : "bug";
  const fromAdmin = searchParams.get("from") === "admin";
  const [kind, setKind] = useState(initialKind);
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
      setError(
        kind === "feedback"
          ? "A sentence or two about your idea helps Tech Guy understand."
          : "A sentence or two about what you saw helps Tech Guy fix it faster.",
      );
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
          kind,
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

  const copy = supportCopy({ fromAdmin, isAdmin, kind });

  return (
    <Shell>
      <Card style={{ marginTop: 24, padding: 28 }}>
        <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 700, color: T.accentDeep, letterSpacing: "0.02em" }}>
          {copy.eyebrow}
        </p>
        <h1 style={{ fontFamily: FD, fontWeight: 400, fontSize: 28, margin: "0 0 10px", lineHeight: 1.2 }}>
          {copy.title}
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.55, color: T.inkSoft, margin: "0 0 8px" }}>
          {copy.blurb}
        </p>
        <p style={{ fontSize: 13.5, color: T.inkSoft, margin: "0 0 20px" }}>
          Signed in as <b style={{ color: T.ink }}>{user.email}</b>
          {fromAdmin ? (
            <>
              {" · "}
              <Link to={PATHS.admin} style={{ color: T.accent, fontWeight: 700 }}>Back to admin</Link>
            </>
          ) : null}
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
            {kind === "feedback"
              ? "Thanks — Tech Guy will read your feedback."
              : "Tech Guy will take a look. Thanks for flagging it."}
          </div>
        ) : (
          <form onSubmit={submit}>
            <div style={labelStyle}>What kind of note is this?</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {KINDS.map((k) => {
                const active = kind === k.id;
                return (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => setKind(k.id)}
                    style={{
                      textAlign: "left",
                      fontFamily: F,
                      border: `1.5px solid ${active ? T.accent : T.border}`,
                      background: active ? T.accentSoft : "#fff",
                      borderRadius: 12,
                      padding: "12px 14px",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontSize: 14.5, fontWeight: 700, color: T.ink }}>{k.label}</div>
                    <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 3, lineHeight: 1.4 }}>{k.hint}</div>
                  </button>
                );
              })}
            </div>

            <label style={labelStyle} htmlFor="support-message">
              {kind === "feedback" ? "Your feedback" : "What happened?"}
            </label>
            <textarea
              id="support-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              placeholder={
                kind === "feedback"
                  ? "e.g. I’d love a way to copy last week’s plan…"
                  : "e.g. Plan my week showed a blank screen after I opened shopping list…"
              }
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
