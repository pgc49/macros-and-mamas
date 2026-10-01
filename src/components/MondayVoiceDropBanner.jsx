import { useEffect, useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { db } from "../db/db";
import { formatVoiceDuration } from "../lib/voiceMemo";
import {
  loadCurrentVoiceDropCached,
  peekVoiceDropCache,
} from "../lib/voiceDropCache";
import { VoiceMemoPlayer } from "./VoiceMemoPlayer";

const STORAGE_KEY = "mm_voice_drop_dismissed";

function readDismissedId() {
  try {
    return localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function persistDismissedId(id) {
  try {
    localStorage.setItem(STORAGE_KEY, String(id || ""));
  } catch {
    /* private mode — session hide only */
  }
}

/**
 * Today-page PSA for Callie's Monday voice drop.
 * RLS returns this mama's drop (Founding and Cohort 2 can both be live).
 * Dismiss is per drop id (next Monday reappears).
 */
function applyDrop(row, setDrop, setHidden) {
  if (!row?.id) {
    setDrop(null);
    setHidden(false);
    return;
  }
  setDrop(row);
  setHidden(readDismissedId() === row.id);
}

export function MondayVoiceDropBanner({ previewDrop = null } = {}) {
  const isPreview = Boolean(previewDrop);
  const seeded = isPreview ? previewDrop : peekVoiceDropCache();
  const [drop, setDrop] = useState(() => (seeded?.id ? seeded : null));
  const [hidden, setHidden] = useState(() => (
    seeded?.id ? readDismissedId() === seeded.id : false
  ));
  const [loading, setLoading] = useState(() => seeded === undefined);

  useEffect(() => {
    if (isPreview) {
      setDrop(previewDrop);
      setHidden(false);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    if (seeded !== undefined) {
      applyDrop(seeded, setDrop, setHidden);
      setLoading(false);
      return undefined;
    }
    (async () => {
      try {
        const row = await loadCurrentVoiceDropCached(() => db.loadCurrentVoiceDrop());
        if (cancelled) return;
        applyDrop(row, setDrop, setHidden);
      } catch (e) {
        console.warn("voice drop load failed", e);
        if (!cancelled) setDrop(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [seeded, isPreview, previewDrop]);

  const dismiss = () => {
    if (!isPreview && drop?.id) persistDismissedId(drop.id);
    setHidden(true);
  };

  if (isPreview) {
    if (hidden || !drop) return null;
  } else if (loading || hidden || !drop?.audioUrl) return null;

  const caption = String(drop.caption || "").trim();
  const durationLabel = drop.durationMs
    ? formatVoiceDuration(drop.durationMs)
    : null;

  return (
    <div
      style={{
        marginBottom: 14,
        padding: "14px 14px 12px",
        borderRadius: 14,
        background: `linear-gradient(145deg, ${T.accentSoft} 0%, #fff 55%)`,
        border: `1.5px solid ${T.border}`,
        position: "relative",
        overflowAnchor: "none",
      }}
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss voice drop"
        style={{
          position: "absolute",
          top: 8,
          right: 10,
          border: "none",
          background: "transparent",
          color: T.inkSoft,
          fontSize: 18,
          lineHeight: 1,
          cursor: "pointer",
          padding: "4px 6px",
          fontFamily: F,
        }}
      >
        ×
      </button>

      <div style={{ paddingRight: 28 }}>
        <div style={{
          fontFamily: FD,
          fontSize: 18,
          color: T.ink,
          marginBottom: 2,
        }}
        >
          Monday voice drop
        </div>
        <div style={{ fontSize: 12.5, color: T.inkSoft, marginBottom: caption ? 8 : 10 }}>
          Callie
          {durationLabel ? ` · ${durationLabel}` : ""}
          {" · "}
          listen this week
        </div>
        {caption ? (
          <p style={{
            fontSize: 13.5,
            color: T.ink,
            margin: "0 0 10px",
            lineHeight: 1.45,
            fontFamily: F,
          }}
          >
            {caption}
          </p>
        ) : null}
        {drop.audioUrl ? (
          <VoiceMemoPlayer
            src={drop.audioUrl}
            label="Listen"
            durationMs={drop.durationMs || 0}
            style={{ maxWidth: "100%" }}
          />
        ) : (
          <div style={{ fontSize: 13, color: T.inkSoft }}>Listen (preview)</div>
        )}
      </div>
    </div>
  );
}
