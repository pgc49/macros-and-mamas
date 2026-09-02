/**
 * Decide sheet must eat its own pointer events.
 * After an inner scroll, iOS/WebKit can fire a ghost click on whatever
 * sits under the finger (Today tab, a log row). Those clicks have no
 * pointerdown on the target — require an own-pointer handshake.
 */

const SCROLL_HOT_MS = 800;
const INSIDE_HOLD_MS = 700;

let scrolledAt = 0;
let pointerInside = false;
let leaveTimer = 0;

export function markDecideScroll() {
  scrolledAt = Date.now();
}

export function markDecidePointerInside() {
  pointerInside = true;
  if (leaveTimer) {
    clearTimeout(leaveTimer);
    leaveTimer = 0;
  }
}

export function markDecidePointerLeft() {
  if (leaveTimer) clearTimeout(leaveTimer);
  leaveTimer = setTimeout(() => {
    pointerInside = false;
    leaveTimer = 0;
  }, INSIDE_HOLD_MS);
}

export function resetDecideScroll() {
  scrolledAt = 0;
  pointerInside = false;
  if (leaveTimer) {
    clearTimeout(leaveTimer);
    leaveTimer = 0;
  }
}

export function decideScrollIsHot(ms = SCROLL_HOT_MS) {
  return Date.now() - scrolledAt < ms;
}

export function decidePointerIsInside() {
  return pointerInside;
}

function decideClickIsGhost() {
  return decideScrollIsHot() || pointerInside;
}

export function trapDecideEvent(e) {
  e.stopPropagation();
  const type = e.type || "";
  if (type === "pointerdown" || type === "touchstart") markDecidePointerInside();
  if (type === "pointerup" || type === "touchend" || type === "pointercancel") {
    markDecidePointerLeft();
  }
}

/**
 * Click only counts if pointerdown happened on this same control — or this
 * is a normal activation (tests / keyboard). Ghost clicks after a Decide
 * scroll or an in-sheet pointer have no pointerdown on the target.
 */
export function ownPointerClick(onClick) {
  let armed = false;
  return {
    onPointerDown: (e) => {
      if (e.button != null && e.button !== 0) return;
      armed = true;
    },
    onClick: (e) => {
      if (!armed && decideClickIsGhost()) {
        e.preventDefault?.();
        e.stopPropagation?.();
        return;
      }
      armed = false;
      onClick?.(e);
    },
  };
}
