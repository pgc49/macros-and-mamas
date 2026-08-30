/** Long-press delay. Longer than iOS text-handle start so copy can win. */
export const MESSAGE_HOLD_MS = 700;
export const MESSAGE_HOLD_MOVE_PX = 8;

/** Copy/select on every live bubble, including admin + sender. */
export function bubbleTextSelect(deleted) {
  return deleted ? "none" : "text";
}

export function hasSelectableText(selection) {
  return String(selection ?? "").trim().length > 0;
}
