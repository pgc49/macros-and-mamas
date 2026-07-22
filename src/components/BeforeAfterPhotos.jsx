import { useEffect, useRef, useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { db } from "../db/db";
import { compressImageFile } from "../utils/imageFile";

const PHASES = [
  ["before", "Before"],
  ["after", "After"],
];
const POSES = [
  ["front", "Front"],
  ["side", "Side"],
  ["back", "Back"],
];

/**
 * Fixed 6-slot progress photos (before/after × front/side/back).
 * Private Supabase Storage. Client can upload/replace/delete; admin is view-only.
 */
export function BeforeAfterPhotos({
  profileId = null,
  readOnly = false,
  contestNote = true,
}) {
  const [slots, setSlots] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState(null);
  const [error, setError] = useState("");
  const [viewer, setViewer] = useState(null);
  const fileRefs = useRef({});

  const reload = async () => {
    setLoading(true);
    setError("");
    try {
      const map = await db.loadProgressPhotos(profileId || undefined);
      setSlots(map || {});
    } catch (e) {
      console.error(e);
      setError("Couldn’t load photos. If this is new, run migration 013 in Supabase.");
      setSlots({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const map = await db.loadProgressPhotos(profileId || undefined);
        if (!cancelled) setSlots(map || {});
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setError("Couldn’t load photos. If this is new, run migration 013 in Supabase.");
          setSlots({});
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [profileId]);

  const onPick = async (phase, pose, file) => {
    if (!file || readOnly) return;
    const key = `${phase}|${pose}`;
    setBusyKey(key);
    setError("");
    try {
      const blob = await compressImageFile(file);
      const row = await db.upsertProgressPhoto(phase, pose, blob);
      setSlots((prev) => ({
        ...prev,
        [key]: {
          id: prev[key]?.id,
          phase,
          pose,
          path: row.path,
          url: row.url,
          updated_at: row.updated_at,
        },
      }));
    } catch (e) {
      console.error(e);
      setError(e?.message || "Upload failed");
    } finally {
      setBusyKey(null);
    }
  };

  const onDelete = async (phase, pose) => {
    if (readOnly) return;
    const key = `${phase}|${pose}`;
    setBusyKey(key);
    setError("");
    try {
      await db.deleteProgressPhoto(phase, pose);
      setSlots((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      if (viewer?.key === key) setViewer(null);
    } catch (e) {
      console.error(e);
      setError(e?.message || "Couldn’t delete");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div>
      <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 6 }}>Before + after photos</div>
      {contestNote && (
        <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.55, marginBottom: 12 }}>
          Same outfit, same spot, same lighting — front, side, and back. Faces optional.
          {readOnly
            ? " Private to her account (and admins)."
            : " Private to you. The most transformed mama in this founding group wins Callie’s Gut Reset Guide."}
        </div>
      )}

      {loading && (
        <div style={{ fontSize: 13.5, color: T.inkSoft }}>Loading photos…</div>
      )}
      {error && (
        <div style={{ fontSize: 13, color: T.amber, marginBottom: 10, lineHeight: 1.45 }}>{error}</div>
      )}

      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {PHASES.map(([phase, phaseLabel]) => (
            <div key={phase}>
              <div style={{
                fontSize: 12,
                fontWeight: 700,
                color: T.accentDeep,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                marginBottom: 8,
              }}
              >
                {phaseLabel}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {POSES.map(([pose, poseLabel]) => {
                  const key = `${phase}|${pose}`;
                  const slot = slots[key];
                  const busy = busyKey === key;
                  return (
                    <div key={key}>
                      {!readOnly && (
                        <input
                          ref={(el) => { fileRefs.current[key] = el; }}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          style={{ display: "none" }}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = "";
                            onPick(phase, pose, f);
                          }}
                        />
                      )}
                      <button
                        type="button"
                        disabled={busy || (readOnly && !slot?.url)}
                        onClick={() => {
                          if (slot?.url) {
                            setViewer({ key, url: slot.url, label: `${phaseLabel} · ${poseLabel}` });
                            return;
                          }
                          if (!readOnly) fileRefs.current[key]?.click();
                        }}
                        style={{
                          display: "block",
                          width: "100%",
                          aspectRatio: "3 / 4",
                          borderRadius: 12,
                          border: `1.5px dashed ${slot?.url ? T.border : T.accent}`,
                          background: slot?.url ? "#fff" : T.accentSoft,
                          padding: 0,
                          overflow: "hidden",
                          cursor: busy ? "wait" : "pointer",
                          position: "relative",
                          fontFamily: F,
                        }}
                      >
                        {slot?.url ? (
                          <img
                            src={slot.url}
                            alt={`${phaseLabel} ${poseLabel}`}
                            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                          />
                        ) : (
                          <div style={{
                            height: "100%",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 4,
                            padding: 8,
                          }}
                          >
                            <span style={{ fontSize: 13, fontWeight: 700, color: T.accentDeep }}>
                              {busy ? "…" : readOnly ? "—" : "+ Add"}
                            </span>
                            <span style={{ fontSize: 12, color: T.inkSoft }}>{poseLabel}</span>
                          </div>
                        )}
                        {slot?.url && (
                          <span style={{
                            position: "absolute",
                            left: 6,
                            bottom: 6,
                            fontSize: 11,
                            fontWeight: 700,
                            background: "rgba(51,39,46,0.72)",
                            color: "#fff",
                            padding: "2px 7px",
                            borderRadius: 6,
                          }}
                          >
                            {poseLabel}
                          </span>
                        )}
                      </button>
                      {!readOnly && slot?.url && (
                        <div style={{ display: "flex", gap: 10, marginTop: 4, justifyContent: "center" }}>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => fileRefs.current[key]?.click()}
                            style={linkBtn}
                          >
                            Replace
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => onDelete(phase, pose)}
                            style={{ ...linkBtn, color: T.inkSoft }}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                      {readOnly && !slot?.url && (
                        <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 3, textAlign: "center" }}>
                          {poseLabel} — empty
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && !readOnly && (
        <button
          type="button"
          onClick={reload}
          style={{
            marginTop: 12,
            background: "none",
            border: "none",
            color: T.inkSoft,
            fontSize: 12.5,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: F,
            padding: 0,
          }}
        >
          Refresh
        </button>
      )}

      {viewer?.url && (
        <div
          role="dialog"
          aria-label={viewer.label}
          onClick={() => setViewer(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(51,39,46,0.88)",
            zIndex: 80,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <img
            src={viewer.url}
            alt={viewer.label}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "100%",
              maxHeight: "78vh",
              borderRadius: 12,
              objectFit: "contain",
            }}
          />
          <div style={{ color: "#fff", fontSize: 14, fontWeight: 700, marginTop: 12 }}>{viewer.label}</div>
          <button
            type="button"
            onClick={() => setViewer(null)}
            style={{
              marginTop: 10,
              border: "none",
              background: "#fff",
              color: T.ink,
              fontWeight: 700,
              fontFamily: F,
              fontSize: 14,
              padding: "10px 18px",
              borderRadius: 999,
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}

const linkBtn = {
  background: "none",
  border: "none",
  padding: 0,
  fontSize: 12,
  fontWeight: 700,
  color: T.accent,
  cursor: "pointer",
  fontFamily: F,
};
