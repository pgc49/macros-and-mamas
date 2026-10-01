import { describe, expect, it, vi } from "vitest";
import {
  REALTIME_COALESCE_MAX_MS,
  REALTIME_COALESCE_MS,
  createCoalescedRefresh,
} from "./realtimeCoalesce";

/** Deterministic stand-in for setTimeout so tests advance a clock, not a wall. */
function fakeClock() {
  let nowMs = 0;
  let nextId = 1;
  const pending = new Map();
  return {
    now: () => nowMs,
    schedule(fn, ms) {
      const id = nextId++;
      pending.set(id, { fn, at: nowMs + ms });
      return id;
    },
    cancelScheduled(id) {
      pending.delete(id);
    },
    pendingCount: () => pending.size,
    async advance(ms) {
      const until = nowMs + ms;
      // Fire in due order; a callback may schedule further work.
      for (;;) {
        const due = [...pending.entries()]
          .filter(([, task]) => task.at <= until)
          .sort((a, b) => a[1].at - b[1].at);
        if (!due.length) break;
        const [id, task] = due[0];
        pending.delete(id);
        nowMs = Math.max(nowMs, task.at);
        task.fn();
        await Promise.resolve();
        await Promise.resolve();
      }
      nowMs = until;
    },
  };
}

function harness(run, options = {}) {
  const clock = fakeClock();
  const refresh = createCoalescedRefresh(run, {
    now: clock.now,
    schedule: clock.schedule,
    cancelScheduled: clock.cancelScheduled,
    ...options,
  });
  return { clock, refresh };
}

describe("createCoalescedRefresh", () => {
  it("collapses a burst of events into one refresh", async () => {
    const run = vi.fn();
    const { clock, refresh } = harness(run);

    // Ten sends landing in a group forum inside half a second.
    for (let i = 0; i < 10; i += 1) {
      refresh.request();
      await clock.advance(20);
    }
    expect(run).not.toHaveBeenCalled();

    await clock.advance(REALTIME_COALESCE_MS);
    expect(run).toHaveBeenCalledTimes(1);
    refresh.dispose();
  });

  it("does not fire before the debounce window closes", async () => {
    const run = vi.fn();
    const { clock, refresh } = harness(run);

    refresh.request();
    await clock.advance(REALTIME_COALESCE_MS - 1);
    expect(run).not.toHaveBeenCalled();

    await clock.advance(1);
    expect(run).toHaveBeenCalledTimes(1);
    refresh.dispose();
  });

  it("stops a sustained stream from starving the refresh", async () => {
    const run = vi.fn();
    const { clock, refresh } = harness(run);

    // An event every 100ms forever would defer a plain debounce indefinitely.
    for (let elapsed = 0; elapsed < REALTIME_COALESCE_MAX_MS + 200; elapsed += 100) {
      refresh.request();
      await clock.advance(100);
    }

    expect(run).toHaveBeenCalled();
    refresh.dispose();
  });

  it("starts a fresh window after a refresh completes", async () => {
    const run = vi.fn();
    const { clock, refresh } = harness(run);

    refresh.request();
    await clock.advance(REALTIME_COALESCE_MS);
    expect(run).toHaveBeenCalledTimes(1);

    refresh.request();
    await clock.advance(REALTIME_COALESCE_MS);
    expect(run).toHaveBeenCalledTimes(2);
    refresh.dispose();
  });

  it("never overlaps two refreshes and replays events that arrived mid-flight", async () => {
    let release;
    let inFlight = 0;
    let maxInFlight = 0;
    const run = vi.fn(() => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise((resolve) => {
        release = () => {
          inFlight -= 1;
          resolve();
        };
      });
    });
    const { clock, refresh } = harness(run);

    refresh.request();
    await clock.advance(REALTIME_COALESCE_MS);
    expect(run).toHaveBeenCalledTimes(1);

    // A message lands while the first load is still running.
    refresh.request();
    await clock.advance(REALTIME_COALESCE_MS);
    expect(run).toHaveBeenCalledTimes(1);
    expect(maxInFlight).toBe(1);

    release();
    await Promise.resolve();
    await clock.advance(REALTIME_COALESCE_MS);

    expect(run).toHaveBeenCalledTimes(2);
    expect(maxInFlight).toBe(1);
    release();
    refresh.dispose();
  });

  it("reports a failed refresh without breaking later ones", async () => {
    const onError = vi.fn();
    const run = vi.fn()
      .mockRejectedValueOnce(new Error("network hiccup"))
      .mockResolvedValueOnce(undefined);
    const { clock, refresh } = harness(run, { onError });

    refresh.request();
    await clock.advance(REALTIME_COALESCE_MS);
    expect(onError).toHaveBeenCalledTimes(1);

    refresh.request();
    await clock.advance(REALTIME_COALESCE_MS);
    expect(run).toHaveBeenCalledTimes(2);
    refresh.dispose();
  });

  it("runs immediately on flush", async () => {
    const run = vi.fn();
    const { clock, refresh } = harness(run);

    refresh.request();
    await refresh.flush();

    expect(run).toHaveBeenCalledTimes(1);
    expect(clock.pendingCount()).toBe(0);
    refresh.dispose();
  });

  it("drops queued work on dispose so an unmounted view never refreshes", async () => {
    const run = vi.fn();
    const { clock, refresh } = harness(run);

    refresh.request();
    refresh.dispose();
    await clock.advance(REALTIME_COALESCE_MAX_MS * 2);

    expect(run).not.toHaveBeenCalled();
    expect(clock.pendingCount()).toBe(0);
  });

  it("ignores requests made after dispose", async () => {
    const run = vi.fn();
    const { clock, refresh } = harness(run);

    refresh.dispose();
    refresh.request();
    await clock.advance(REALTIME_COALESCE_MAX_MS * 2);

    expect(run).not.toHaveBeenCalled();
  });

  it("reports whether a refresh is still owed", async () => {
    const run = vi.fn();
    const { clock, refresh } = harness(run);

    expect(refresh.isPending()).toBe(false);
    refresh.request();
    expect(refresh.isPending()).toBe(true);

    await clock.advance(REALTIME_COALESCE_MS);
    expect(refresh.isPending()).toBe(false);
    refresh.dispose();
  });
});
