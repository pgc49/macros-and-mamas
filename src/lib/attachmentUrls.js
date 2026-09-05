import { createSignedUrlCache } from "./signedUrlCache";

/**
 * Process-wide store of signed message-attachment URLs, shared by DM and
 * channel loads.
 *
 * One instance rather than one per module so a thread refresh reuses the URL an
 * image is already rendering. Kept out of `db/db.js` so signing out can drop it
 * without dragging the whole data layer into the auth bundle.
 */
export const attachmentUrlCache = createSignedUrlCache();

/** Drop cached URLs so they cannot outlive the session that signed them. */
export function resetAttachmentUrlCache() {
  attachmentUrlCache.clear();
}
