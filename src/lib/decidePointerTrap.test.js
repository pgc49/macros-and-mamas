// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decidePointerIsInside,
  decideScrollIsHot,
  markDecidePointerInside,
  markDecideScroll,
  ownPointerClick,
  resetDecideScroll,
  trapDecideEvent,
} from "./decidePointerTrap.js";

afterEach(() => {
  resetDecideScroll();
});

describe("decideScrollIsHot", () => {
  it("is hot only right after markDecideScroll", () => {
    expect(decideScrollIsHot(10_000)).toBe(false);
    markDecideScroll();
    expect(decideScrollIsHot(10_000)).toBe(true);
  });
});

describe("ownPointerClick", () => {
  it("ignores a ghost click after Decide scroll with no pointerdown", () => {
    markDecideScroll();
    const onClick = vi.fn();
    const h = ownPointerClick(onClick);
    const ev = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
    h.onClick(ev);
    expect(onClick).not.toHaveBeenCalled();
    expect(ev.stopPropagation).toHaveBeenCalled();
  });

  it("ignores a ghost click after a pointer that started on Decide", () => {
    markDecidePointerInside();
    const onClick = vi.fn();
    const h = ownPointerClick(onClick);
    h.onClick({ preventDefault: vi.fn(), stopPropagation: vi.fn() });
    expect(onClick).not.toHaveBeenCalled();
    expect(decidePointerIsInside()).toBe(true);
  });

  it("allows a normal click when Decide has not just scrolled", () => {
    const onClick = vi.fn();
    const h = ownPointerClick(onClick);
    h.onClick({});
    expect(onClick).toHaveBeenCalled();
  });

  it("fires when pointerdown armed the same control", () => {
    markDecideScroll();
    markDecidePointerInside();
    const onClick = vi.fn();
    const h = ownPointerClick(onClick);
    h.onPointerDown({ button: 0 });
    h.onClick({});
    expect(onClick).toHaveBeenCalled();
  });
});

describe("trapDecideEvent", () => {
  it("stops propagation and marks the pointer as inside Decide", () => {
    const ev = { type: "pointerdown", stopPropagation: vi.fn() };
    trapDecideEvent(ev);
    expect(ev.stopPropagation).toHaveBeenCalled();
    expect(decidePointerIsInside()).toBe(true);
  });
});
