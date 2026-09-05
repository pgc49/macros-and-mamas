import { useEffect, useRef } from "react";
import { F } from "../theme/tokens";

/**
 * In-thread photo enlarge. iMessage-style: tap the bubble, see the picture
 * full-screen, tap X (or the dimmed edge, or Escape) to go back. Never opens
 * a signed Storage URL in a new tab.
 */
export function MessagePhotoViewer({ src, alt = "Photo", onClose }) {
  const closeRef = useRef(null);

  useEffect(() => {
    if (!src) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [src, onClose]);

  if (!src) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo"
      data-photo-viewer
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 120,
        background: "rgba(51,39,46,0.88)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        boxSizing: "border-box",
      }}
    >
      <button
        type="button"
        ref={closeRef}
        aria-label="Close photo"
        data-close-photo
        onClick={(event) => {
          event.stopPropagation();
          onClose?.();
        }}
        style={{
          position: "absolute",
          top: "max(12px, env(safe-area-inset-top))",
          right: 12,
          width: 44,
          height: 44,
          borderRadius: 999,
          border: "none",
          background: "rgba(255,255,255,0.16)",
          color: "#fff",
          fontFamily: F,
          fontSize: 28,
          lineHeight: 1,
          cursor: "pointer",
        }}
      >
        ×
      </button>
      <img
        src={src}
        alt={alt}
        data-testid="photo-viewer-image"
        onClick={(event) => event.stopPropagation()}
        style={{
          maxWidth: "100%",
          maxHeight: "100%",
          objectFit: "contain",
          borderRadius: 8,
          boxShadow: "0 8px 32px rgba(0,0,0,0.28)",
        }}
      />
      <span style={{
        position: "absolute",
        bottom: "max(16px, env(safe-area-inset-bottom))",
        left: 0,
        right: 0,
        textAlign: "center",
        color: "rgba(255,255,255,0.72)",
        fontFamily: F,
        fontSize: 12.5,
        pointerEvents: "none",
      }}
      >
        Tap × or outside the photo to close
      </span>
    </div>
  );
}
