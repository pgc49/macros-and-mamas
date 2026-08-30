/** Still-hold delay. A hold must open the picker even if iOS starts selecting. */
export const MESSAGE_HOLD_MS = 700;
export const MESSAGE_HOLD_MOVE_PX = 8;

/**
 * Desktop/default: live bubbles stay selectable so a mouse drag can copy.
 * Coarse pointers (iPhone) override this via `BUBBLE_HOLD_SELECT_CSS` so a
 * hold opens the reaction picker instead of the native text handles.
 */
export function bubbleTextSelect(deleted) {
  return deleted ? "none" : "text";
}

/**
 * On touch devices, kill the iOS callout / mid-hold selection so the 700ms
 * timer can open the existing menu. Fine-pointer (mouse) keeps user-select.
 */
export const BUBBLE_HOLD_SELECT_CSS = `
[data-msg-id] { -webkit-touch-callout: none; }
@media (hover: none), (pointer: coarse) {
  [data-msg-id] {
    -webkit-user-select: none !important;
    user-select: none !important;
  }
}
`;

export function hasSelectableText(selection) {
  return String(selection ?? "").trim().length > 0;
}

/** Body text for the long-press Copy action. Display-only; stored body unchanged. */
export function copyableMessageBody(message) {
  if (!message || message.deleted_at) return "";
  return String(message.body ?? "");
}

/**
 * Arm a hold only when the user is not already mid-copy.
 * Selection that appears *during* the hold (iOS) must not cancel the picker.
 */
export function holdOpensMenu(selectionAtArm) {
  return !hasSelectableText(selectionAtArm);
}
