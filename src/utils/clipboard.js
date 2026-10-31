/** Clipboard helper — shared by referral copy, admin phone copy, and grocery list. */

function copyWithTextarea(value) {
  const ta = document.createElement("textarea");
  ta.value = value;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.top = "0";
  ta.style.left = "0";
  ta.style.opacity = "0";
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  document.body.appendChild(ta);
  ta.focus({ preventScroll: true });
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  if (window.scrollX !== scrollX || window.scrollY !== scrollY) window.scrollTo(scrollX, scrollY);
  return ok;
}

/**
 * Copy during the tap. The async clipboard API is tried, and a textarea copy
 * runs in the same turn so a permission prompt that never finishes still copies.
 */
export async function copyText(text) {
  const value = String(text ?? "");
  if (!value) throw new Error("Nothing to copy");

  const legacyOk = typeof document !== "undefined" && copyWithTextarea(value);
  const write = typeof navigator !== "undefined" ? navigator.clipboard?.writeText : null;
  if (!write) {
    if (legacyOk) return;
    throw new Error("Copy failed");
  }

  let pending;
  try {
    pending = Promise.resolve(write.call(navigator.clipboard, value));
  } catch (err) {
    pending = Promise.reject(err);
  }
  pending = pending.catch((err) => {
    if (legacyOk) return;
    throw err;
  });

  // The textarea path already copied inside this tap. Don't wait on a clipboard
  // permission that may never settle.
  if (legacyOk) return;

  let timer;
  try {
    await Promise.race([
      pending,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Copy failed")), 700);
      }),
    ]);
  } finally {
    if (timer != null) clearTimeout(timer);
  }
}
