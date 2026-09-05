/**
 * Photo bubbles reserve their real box before the file decodes so a late
 * image cannot collapse the list and yank a pinned reader off the tip.
 */

import { IMAGE_RESERVE_MAX, reservedImageHeight } from "./messageListWindow";

export function isImageAttachmentMime(mime) {
  return String(mime || "").toLowerCase().startsWith("image/");
}

export function readImageDimensions(file) {
  return new Promise((resolve) => {
    if (typeof Image === "undefined" || !file || !isImageAttachmentMime(file.type)) {
      resolve(null);
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const width = Number(image.naturalWidth) || 0;
      const height = Number(image.naturalHeight) || 0;
      URL.revokeObjectURL(url);
      resolve(width > 0 && height > 0 ? { width, height } : null);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}

export function attachmentMediaFields(size) {
  const width = Number(size?.width || size?.attachment_width) || 0;
  const height = Number(size?.height || size?.attachment_height) || 0;
  if (width < 1 || height < 1) return {};
  return { attachment_width: Math.round(width), attachment_height: Math.round(height) };
}

export function imageBoxStyle(message, {
  maxHeight = IMAGE_RESERVE_MAX,
  maxWidth = "100%",
} = {}) {
  const reserve = reservedImageHeight(message, { maxImageHeight: maxHeight });
  const width = Number(message?.attachment_width) || 0;
  const height = Number(message?.attachment_height) || 0;
  return {
    display: "block",
    maxWidth,
    maxHeight,
    width: "100%",
    height: "auto",
    minHeight: reserve,
    aspectRatio: width > 0 && height > 0 ? `${width} / ${height}` : undefined,
    borderRadius: 10,
    objectFit: "cover",
    background: "#EFE8E4",
  };
}

/** Cache signed Storage GETs by object path so a token refresh still hits disk. */
export function attachmentCacheKey(url) {
  try {
    const parsed = new URL(String(url || ""), "https://example.invalid");
    if (!isAttachmentObjectPath(parsed.pathname)) return "";
    return parsed.pathname;
  } catch {
    return "";
  }
}

export function isAttachmentObjectPath(pathname) {
  return /\/storage\/v1\/object\/sign\/(message-attachments|channel-attachments)\//.test(
    String(pathname || ""),
  );
}

export function isMissingAttachmentMediaColumn(error) {
  return /attachment_width|attachment_height/i.test(String(error?.message || error?.code || ""));
}
