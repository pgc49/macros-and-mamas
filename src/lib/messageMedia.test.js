import { describe, expect, it } from "vitest";
import {
  attachmentCacheKey,
  attachmentMediaFields,
  imageBoxStyle,
  isAttachmentObjectPath,
  isImageAttachmentMime,
  isMissingAttachmentMediaColumn,
} from "./messageMedia";

describe("messageMedia", () => {
  it("recognizes image attachments", () => {
    expect(isImageAttachmentMime("image/jpeg")).toBe(true);
    expect(isImageAttachmentMime("audio/mp4")).toBe(false);
  });

  it("only persists finite pixel sizes", () => {
    expect(attachmentMediaFields({ width: 800, height: 600 })).toEqual({
      attachment_width: 800,
      attachment_height: 600,
    });
    expect(attachmentMediaFields({ width: 0, height: 10 })).toEqual({});
  });

  it("reserves the decoded box with an aspect-ratio so the list cannot collapse", () => {
    const style = imageBoxStyle({
      attachment_width: 640,
      attachment_height: 400,
    });
    expect(style.aspectRatio).toBe("640 / 400");
    expect(style.minHeight).toBeGreaterThanOrEqual(80);
    expect(style.maxHeight).toBe(240);
  });

  it("caches signed Storage URLs by object path, not by token", () => {
    const url = "https://proj.supabase.co/storage/v1/object/sign/message-attachments/u/pic.jpg?token=abc";
    expect(isAttachmentObjectPath(new URL(url).pathname)).toBe(true);
    expect(attachmentCacheKey(url)).toBe("/storage/v1/object/sign/message-attachments/u/pic.jpg");
    expect(attachmentCacheKey("https://example.com/api/checkout")).toBe("");
  });

  it("detects a missing media-column error so writes can retry without it", () => {
    expect(isMissingAttachmentMediaColumn({ message: "column attachment_width does not exist" })).toBe(true);
    expect(isMissingAttachmentMediaColumn({ message: "jwt expired" })).toBe(false);
  });
});
