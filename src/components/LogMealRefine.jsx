import { useEffect, useRef, useState } from "react";
import { T, F } from "../theme/tokens";
import { Btn } from "./ui";

const MAX_PHOTOS = 3;
const NOTE_MAX = 400;

/**
 * One catch-all updater for a logged meal:
 * optional photo(s) + one note → Update.
 * Photo is optional — note alone can add food or adjust portions.
 * New photos are treated as extra context on the meal already logged.
 */
export function LogMealRefine({
  onRefine,
  busy = false,
  error = "",
  disabled = false,
}) {
  const [files, setFiles] = useState([]);
  const [note, setNote] = useState("");
  const camRef = useRef(null);
  const libRef = useRef(null);

  useEffect(() => () => {
    files.forEach((item) => {
      try { URL.revokeObjectURL(item.previewUrl); } catch { /* ignore */ }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revoke on unmount only
  }, []);

  const clearPhotos = () => {
    setFiles((prev) => {
      prev.forEach((item) => {
        try { URL.revokeObjectURL(item.previewUrl); } catch { /* ignore */ }
      });
      return [];
    });
  };

  const clear = () => {
    clearPhotos();
    setNote("");
  };

  const stage = (fileList) => {
    const incoming = Array.from(fileList || []).filter((f) => f && f.type?.startsWith("image/"));
    if (!incoming.length) return;
    setFiles((prev) => {
      const room = Math.max(0, MAX_PHOTOS - prev.length);
      return [
        ...prev,
        ...incoming.slice(0, room).map((file) => ({
          file,
          previewUrl: URL.createObjectURL(file),
        })),
      ];
    });
  };

  const removeAt = (idx) => {
    setFiles((prev) => {
      const next = [...prev];
      const [gone] = next.splice(idx, 1);
      if (gone?.previewUrl) {
        try { URL.revokeObjectURL(gone.previewUrl); } catch { /* ignore */ }
      }
      return next;
    });
  };

  const ready = (files.length > 0 || String(note || "").trim().length > 0) && !busy && !disabled;

  const submit = async () => {
    if (!ready) return;
    const ok = await onRefine?.({
      files: files.map((f) => f.file),
      description: note.trim(),
    });
    if (ok !== false) clear();
  };

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${T.border}` }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: T.inkSoft, marginBottom: 4, letterSpacing: 0.3 }}>
        Update this meal
      </div>
      <div style={{ fontSize: 11.5, color: T.inkSoft, marginBottom: 8, lineHeight: 1.45 }}>
        Describe what you added or changed — photo optional. New photos are usually extras or portion context on what’s already logged.
      </div>

      {!files.length ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <Btn small ghost onClick={() => camRef.current?.click()} disabled={busy || disabled}>Add photo</Btn>
          <Btn small ghost onClick={() => libRef.current?.click()} disabled={busy || disabled}>From library</Btn>
        </div>
      ) : (
        <>
          <div style={{
            display: "flex",
            gap: 8,
            overflowX: "auto",
            marginBottom: 8,
            WebkitOverflowScrolling: "touch",
          }}
          >
            {files.map((item, idx) => (
              <div
                key={`${item.previewUrl}-${idx}`}
                style={{
                  position: "relative",
                  flex: "0 0 auto",
                  width: 88,
                  height: 88,
                  borderRadius: 10,
                  overflow: "hidden",
                  border: `1px solid ${T.border}`,
                  background: "#fff",
                }}
              >
                <img
                  src={item.previewUrl}
                  alt={`Update photo ${idx + 1}`}
                  style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
                />
                <button
                  type="button"
                  disabled={busy || disabled}
                  onClick={() => removeAt(idx)}
                  aria-label={`Remove photo ${idx + 1}`}
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    width: 24,
                    height: 24,
                    borderRadius: 999,
                    border: "none",
                    background: "rgba(51,39,46,0.72)",
                    color: "#fff",
                    fontSize: 14,
                    lineHeight: 1,
                    cursor: busy || disabled ? "default" : "pointer",
                    fontFamily: F,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          {files.length < MAX_PHOTOS && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              <Btn small ghost onClick={() => camRef.current?.click()} disabled={busy || disabled}>Add photo</Btn>
              <button
                type="button"
                disabled={busy || disabled}
                onClick={clearPhotos}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 12.5,
                  color: T.inkSoft,
                  cursor: busy || disabled ? "default" : "pointer",
                  textDecoration: "underline",
                  fontFamily: F,
                }}
              >
                clear photos
              </button>
            </div>
          )}
        </>
      )}

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
        placeholder={
          files.length
            ? "What’s in the new photo? e.g. side of bread · half eaten · also the salad"
            : "e.g. also had Greek yogurt · half the plate · no rice · sauce on the side"
        }
        rows={2}
        disabled={busy || disabled}
        style={{
          display: "block",
          width: "100%",
          marginBottom: 8,
          padding: "9px 11px",
          fontSize: 14,
          fontFamily: F,
          border: `1.5px solid ${T.border}`,
          borderRadius: 10,
          background: "#fff",
          color: T.ink,
          boxSizing: "border-box",
          resize: "vertical",
        }}
      />

      <Btn small onClick={submit} disabled={!ready}>
        {busy ? "Updating…" : "Update"}
      </Btn>

      {error && (
        <div style={{ fontSize: 12, color: T.amber, marginTop: 6, lineHeight: 1.45 }}>{error}</div>
      )}

      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        disabled={busy || disabled}
        style={{ display: "none" }}
        onChange={(e) => {
          stage(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={libRef}
        type="file"
        accept="image/*"
        multiple
        disabled={busy || disabled}
        style={{ display: "none" }}
        onChange={(e) => {
          stage(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
