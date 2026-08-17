/** Public Meta Pixel ID — safe in the client. Not a secret. */
export const DEFAULT_META_PIXEL_ID = "1078367721716098";

export function resolveMetaPixelId(env) {
  const fromEnv = String(env?.META_PIXEL_ID || "").trim();
  return fromEnv || DEFAULT_META_PIXEL_ID;
}
