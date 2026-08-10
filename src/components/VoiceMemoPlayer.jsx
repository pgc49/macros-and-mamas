import { useEffect, useId, useRef, useState } from "react";
import { T, F } from "../theme/tokens";
import { formatVoiceDuration } from "../lib/voiceMemo";

/** Only one memo plays at a time across the app. */
let activeAudioEl = null;

function claimAudio(el) {
  if (activeAudioEl && activeAudioEl !== el) {
    try { activeAudioEl.pause(); } catch { /* ignore */ }
  }
  activeAudioEl = el;
}

function releaseAudio(el) {
  if (activeAudioEl === el) activeAudioEl = null;
}

function durationFromAudio(audio) {
  const d = Number(audio?.duration);
  if (!Number.isFinite(d) || d <= 0) return 0;
  return Math.round(d * 1000);
}

/**
 * Compact scrubbable voice-memo player for chat bubbles / banners.
 * Native <audio controls> on iOS often hides length and seeking — this keeps both visible.
 */
export function VoiceMemoPlayer({
  src,
  label = "Voice memo",
  /** Optional known duration (ms) when the server already has it. */
  durationMs: knownDurationMs = 0,
  style = null,
}) {
  const audioRef = useRef(null);
  const seekingRef = useRef(false);
  const reactId = useId();
  const [playing, setPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(
    Number(knownDurationMs) > 0 ? Number(knownDurationMs) : 0,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setPlaying(false);
    setCurrentMs(0);
    setFailed(false);
    setDurationMs(Number(knownDurationMs) > 0 ? Number(knownDurationMs) : 0);
  }, [src, knownDurationMs]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !src) return undefined;

    const applyDuration = () => {
      const ms = durationFromAudio(audio);
      if (ms > 0) setDurationMs((prev) => (prev > 0 ? prev : ms));
    };

    /** Safari often reports Infinity until we seek once. */
    const resolveSafariDuration = () => {
      if (!Number.isFinite(audio.duration) || audio.duration === Infinity) {
        const onTime = () => {
          audio.removeEventListener("timeupdate", onTime);
          applyDuration();
          try { audio.currentTime = 0; } catch { /* ignore */ }
        };
        audio.addEventListener("timeupdate", onTime);
        try {
          audio.currentTime = 1e101;
        } catch {
          audio.removeEventListener("timeupdate", onTime);
        }
        return;
      }
      applyDuration();
    };

    const onLoaded = () => resolveSafariDuration();
    const onDuration = () => applyDuration();
    const onTime = () => {
      if (seekingRef.current) return;
      setCurrentMs(Math.round((audio.currentTime || 0) * 1000));
    };
    const onPlay = () => {
      claimAudio(audio);
      setPlaying(true);
    };
    const onPause = () => {
      setPlaying(false);
      releaseAudio(audio);
    };
    const onEnded = () => {
      setPlaying(false);
      setCurrentMs(0);
      try { audio.currentTime = 0; } catch { /* ignore */ }
      releaseAudio(audio);
    };
    const onError = () => setFailed(true);

    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("durationchange", onDuration);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    if (audio.readyState >= 1) resolveSafariDuration();

    return () => {
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("durationchange", onDuration);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      releaseAudio(audio);
    };
  }, [src]);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio || failed) return;
    if (audio.paused) {
      claimAudio(audio);
      try {
        await audio.play();
      } catch (e) {
        console.warn("voice memo play failed", e);
        setFailed(true);
        releaseAudio(audio);
      }
    } else {
      audio.pause();
    }
  };

  const onScrub = (e) => {
    const audio = audioRef.current;
    const next = Number(e.target.value);
    if (!Number.isFinite(next)) return;
    setCurrentMs(next);
    if (audio && durationMs > 0) {
      try { audio.currentTime = next / 1000; } catch { /* ignore */ }
    }
  };

  const stopBubbleGestures = {
    onTouchStart: (e) => e.stopPropagation(),
    onTouchEnd: (e) => e.stopPropagation(),
    onTouchMove: (e) => e.stopPropagation(),
    onMouseDown: (e) => e.stopPropagation(),
    onClick: (e) => e.stopPropagation(),
    onContextMenu: (e) => {
      e.preventDefault();
      e.stopPropagation();
    },
  };

  const totalLabel = durationMs > 0 ? formatVoiceDuration(durationMs) : "–:––";
  const currentLabel = formatVoiceDuration(currentMs);
  const progressMax = Math.max(durationMs, 1);
  const sliderId = `voice-memo-${reactId.replace(/:/g, "")}`;

  if (!src) {
    return (
      <div style={{ fontSize: 13, color: T.inkSoft }}>
        Voice memo (loading…)
      </div>
    );
  }

  return (
    <div style={{ minWidth: 200, maxWidth: 280, ...style }} {...stopBubbleGestures}>
      <div style={{
        fontSize: 12,
        fontWeight: 700,
        color: T.accentDeep,
        marginBottom: 8,
        letterSpacing: "0.02em",
        fontFamily: F,
        display: "flex",
        justifyContent: "space-between",
        gap: 8,
        alignItems: "baseline",
      }}
      >
        <span>{label}</span>
        <span style={{ fontWeight: 700, color: T.inkSoft, fontVariantNumeric: "tabular-nums" }}>
          {totalLabel}
        </span>
      </div>

      <audio ref={audioRef} src={src} preload="metadata" playsInline />

      {failed ? (
        <div style={{ fontSize: 13, color: T.inkSoft }}>
          Can’t play this voice memo.
        </div>
      ) : (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
        >
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? "Pause voice memo" : "Play voice memo"}
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              border: "none",
              background: T.accentDeep,
              color: "#fff",
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
              flexShrink: 0,
              padding: 0,
            }}
          >
            {playing ? (
              <span aria-hidden style={{
                display: "flex",
                gap: 3,
                height: 12,
                alignItems: "stretch",
              }}
              >
                <span style={{ width: 3, background: "#fff", borderRadius: 1 }} />
                <span style={{ width: 3, background: "#fff", borderRadius: 1 }} />
              </span>
            ) : (
              <span aria-hidden style={{
                width: 0,
                height: 0,
                marginLeft: 2,
                borderTop: "7px solid transparent",
                borderBottom: "7px solid transparent",
                borderLeft: "11px solid #fff",
              }}
              />
            )}
          </button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <label htmlFor={sliderId} className="sr-only" style={{
              position: "absolute",
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: "hidden",
              clip: "rect(0,0,0,0)",
              whiteSpace: "nowrap",
              border: 0,
            }}
            >
              Scrub voice memo
            </label>
            <input
              id={sliderId}
              type="range"
              min={0}
              max={progressMax}
              step={100}
              value={Math.min(currentMs, progressMax)}
              disabled={durationMs <= 0}
              onPointerDown={() => { seekingRef.current = true; }}
              onPointerUp={() => { seekingRef.current = false; }}
              onPointerCancel={() => { seekingRef.current = false; }}
              onChange={onScrub}
              style={{
                width: "100%",
                accentColor: T.accentDeep,
                cursor: durationMs > 0 ? "pointer" : "default",
                margin: 0,
              }}
            />
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 2,
              fontSize: 11,
              color: T.inkSoft,
              fontFamily: F,
              fontVariantNumeric: "tabular-nums",
            }}
            >
              <span>{currentLabel}</span>
              <span>{totalLabel}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
