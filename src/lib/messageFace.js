/**
 * Face for chat bubbles and reaction chips.
 * Karla has no color-emoji glyphs. Nested spans/buttons that inherit only
 * `'Karla', sans-serif` can drop 💕 / tapbacks in Safari and Chrome after
 * the linkify wrap. Keep system emoji fonts in the stack; display-only.
 */
export const MESSAGE_FACE_FONT =
  "'Karla', 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif";
