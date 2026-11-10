// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MachineClock } from "@/lib/terminal/machine";
import type { ActivityResult, IdleResult } from "@/lib/workspace/environment";
import { Deferred, settle, T0 } from "@/test/terminal-machine";
import { IdleWatcher } from "./idle";

// The idle watcher's schedule (#106 design 5): when it reads, what it shows, and that it never records activity
// by itself. The service's answers are given one read at a time.

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;

const clock: MachineClock = {
  now: () => Date.now(),
  setTimer: (callback, ms) => {
    const id = setTimeout(callback, ms);
    return () => clearTimeout(id);
  },
};

function idle(warnInMs: number, stopInMs: number, warningMinutes = 5): IdleResult {
  return { kind: "idle", warnInMs, stopInMs, warningMinutes };
}

function watcher() {
  const reads: Deferred<IdleResult>[] = [];
  const activities: Deferred<ActivityResult>[] = [];
  const warnings: (number | null)[] = [];
  const sessionExpired = vi.fn();
  const next = <T>(queue: Deferred<T>[]): Promise<T> => {
    const deferred = new Deferred<T>();
    queue.push(deferred);
    return deferred.promise;
  };
  const idleWatcher = new IdleWatcher({
    actions: {
      readEnvironmentIdle: () => next(reads),
      recordEnvironmentActivity: () => next(activities),
    },
    clock,
    onWarning: (minutes) => warnings.push(minutes),
    onSessionExpired: sessionExpired,
  });
  const answer = async (result: IdleResult): Promise<void> => {
    reads.at(-1)?.resolve(result);
    await settle();
  };
  return { idleWatcher, reads, activities, warnings, sessionExpired, answer };
}

const onUnhandledRejection = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  process.on("unhandledRejection", onUnhandledRejection);
});

afterEach(() => {
  vi.useRealTimers();
  process.off("unhandledRejection", onUnhandledRejection);
  onUnhandledRejection.mockClear();
});

describe("IdleWatcher", () => {
  it("reads once at the start and next at the predicted warning time", async () => {
    const w = watcher();

    w.idleWatcher.start({ isHidden: false });
    expect(w.reads).toHaveLength(1);
    await w.answer(idle(4 * MINUTE_MS, 9 * MINUTE_MS));

    expect(w.warnings).toEqual([]);
    vi.advanceTimersByTime(4 * MINUTE_MS - 1);
    expect(w.reads).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(w.reads).toHaveLength(2);
  });

  it("shows the warning once its time has come and reads again after 30 s", async () => {
    const w = watcher();
    w.idleWatcher.start({ isHidden: false });

    await w.answer(idle(0, 4 * MINUTE_MS));

    expect(w.warnings).toEqual([5]);
    vi.advanceTimersByTime(30 * SECOND_MS - 1);
    expect(w.reads).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(w.reads).toHaveLength(2);
  });

  it("hides the warning when a later read finds the window moved", async () => {
    const w = watcher();
    w.idleWatcher.start({ isHidden: false });
    await w.answer(idle(0, 4 * MINUTE_MS));
    vi.advanceTimersByTime(30 * SECOND_MS);

    await w.answer(idle(2 * MINUTE_MS, 7 * MINUTE_MS));

    expect(w.warnings).toEqual([5, null]);
  });

  it("hides the warning at once on continue, records activity once and reads after it", async () => {
    const w = watcher();
    w.idleWatcher.start({ isHidden: false });
    await w.answer(idle(0, 4 * MINUTE_MS));

    w.idleWatcher.continue();

    expect(w.warnings).toEqual([5, null]);
    expect(w.activities).toHaveLength(1);
    expect(w.reads).toHaveLength(1);
    w.activities[0]?.resolve({ kind: "recorded" });
    await settle();
    expect(w.reads).toHaveLength(2);
  });

  it("ignores a read that answers after stop and reads nothing more", async () => {
    const w = watcher();
    w.idleWatcher.start({ isHidden: false });

    w.idleWatcher.stop();
    await w.answer(idle(0, 4 * MINUTE_MS));
    vi.advanceTimersByTime(10 * MINUTE_MS);

    expect(w.warnings).toEqual([]);
    expect(w.reads).toHaveLength(1);
  });

  it("reads nothing while hidden and reads at once when shown again", async () => {
    const w = watcher();
    w.idleWatcher.start({ isHidden: false });
    await w.answer(idle(4 * MINUTE_MS, 9 * MINUTE_MS));

    w.idleWatcher.setHidden(true);
    vi.advanceTimersByTime(10 * MINUTE_MS);
    expect(w.reads).toHaveLength(1);
    w.idleWatcher.setHidden(false);

    expect(w.reads).toHaveLength(2);
  });

  it("never records activity by itself over ten read cycles", async () => {
    const w = watcher();
    w.idleWatcher.start({ isHidden: false });

    for (let cycle = 0; cycle < 10; cycle += 1) {
      await w.answer(idle(0, 4 * MINUTE_MS));
      vi.advanceTimersByTime(30 * SECOND_MS);
    }

    expect(w.reads).toHaveLength(11);
    expect(w.activities).toEqual([]);
  });

  it("backs off failed reads 30 s, 60 s, 120 s up to 5 min and starts over after a success", async () => {
    const w = watcher();
    w.idleWatcher.start({ isHidden: false });
    const waits: number[] = [];

    for (let failure = 0; failure < 5; failure += 1) {
      await w.answer({ kind: "failed" });
      const before = w.reads.length;
      let waited = 0;
      while (w.reads.length === before) {
        vi.advanceTimersByTime(SECOND_MS);
        waited += SECOND_MS;
      }
      waits.push(waited);
    }
    await w.answer(idle(4 * MINUTE_MS, 9 * MINUTE_MS));
    vi.advanceTimersByTime(4 * MINUTE_MS);
    await w.answer({ kind: "failed" });
    vi.advanceTimersByTime(30 * SECOND_MS - 1);
    const beforeLastWait = w.reads.length;
    vi.advanceTimersByTime(1);

    expect(waits).toEqual([30, 60, 120, 240, 300].map((seconds) => seconds * SECOND_MS));
    expect(w.reads).toHaveLength(beforeLastWait + 1);
  });

  it("treats a rejected read as a failed one and leaves no unhandled rejection", async () => {
    const w = watcher();
    w.idleWatcher.start({ isHidden: false });

    w.reads[0]?.reject(new Error("session read failed"));
    await settle();
    vi.advanceTimersByTime(30 * SECOND_MS - 1);
    expect(w.reads).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(w.reads).toHaveLength(2);
    // Node reports an unhandled rejection after the microtasks of a real turn, not on a fake timer.
    vi.useRealTimers();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(onUnhandledRejection).not.toHaveBeenCalled();
  });

  it("reports an expired session once and reads nothing after it", async () => {
    const w = watcher();
    w.idleWatcher.start({ isHidden: false });

    await w.answer({ kind: "unauthenticated" });
    vi.advanceTimersByTime(10 * MINUTE_MS);

    expect(w.sessionExpired).toHaveBeenCalledTimes(1);
    expect(w.reads).toHaveLength(1);
  });

  it("sleeps at most 5 min however far away the warning is", async () => {
    const w = watcher();
    w.idleWatcher.start({ isHidden: false });

    await w.answer(idle(3 * 60 * MINUTE_MS, 3 * 60 * MINUTE_MS + 5 * MINUTE_MS));
    vi.advanceTimersByTime(5 * MINUTE_MS - 1);
    expect(w.reads).toHaveLength(1);
    vi.advanceTimersByTime(1);

    expect(w.reads).toHaveLength(2);
  });

  it("does not read when started hidden until the tab is shown", () => {
    const w = watcher();

    w.idleWatcher.start({ isHidden: true });
    vi.advanceTimersByTime(10 * MINUTE_MS);
    expect(w.reads).toEqual([]);
    w.idleWatcher.setHidden(false);

    expect(w.reads).toHaveLength(1);
  });
});
