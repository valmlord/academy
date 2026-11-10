import { describe, expect, it } from "vitest";
import type { WorkspaceKey } from "../../src/identity.js";
import { IdleTracker } from "../../src/idle.js";

const MINUTE = 60_000;
const T0 = Date.UTC(2026, 10, 3, 12, 0, 0);
const KEY: WorkspaceKey = { userId: "u1", courseId: "c", lessonId: "l" };

function trackerAt(start: number): { tracker: IdleTracker; setNow: (ms: number) => void } {
  let now = start;
  const tracker = new IdleTracker({ stopMinutes: 30, warningMinutes: 5, now: () => now });
  return {
    tracker,
    setNow: (ms) => {
      now = ms;
    },
  };
}

describe("IdleTracker", () => {
  it("1: a touch sets the stop 30 minutes and the warning 25 minutes later", () => {
    const { tracker } = trackerAt(T0);

    tracker.touch("w1", KEY);

    expect(tracker.idleOf("w1")).toEqual({ stopAt: T0 + 30 * MINUTE, warningAt: T0 + 25 * MINUTE });
  });

  it("2: is due exactly at the stop time and not one millisecond before", () => {
    const { tracker } = trackerAt(T0);
    tracker.touch("w1", KEY);

    expect(tracker.due(T0 + 30 * MINUTE - 1)).toEqual([]);
    expect(tracker.due(T0 + 30 * MINUTE)).toEqual([{ id: "w1", key: KEY }]);
  });

  it("3: a second touch moves the stop and the warning from the new time", () => {
    const { tracker, setNow } = trackerAt(T0);
    tracker.touch("w1", KEY);
    const t1 = T0 + 10 * MINUTE;
    setNow(t1);

    tracker.touch("w1", KEY);

    expect(tracker.idleOf("w1")).toEqual({ stopAt: t1 + 30 * MINUTE, warningAt: t1 + 25 * MINUTE });
    expect(tracker.due(T0 + 30 * MINUTE)).toEqual([]);
  });

  it("4: forget removes the workspace from every query", () => {
    const { tracker } = trackerAt(T0);
    tracker.touch("w1", KEY);

    tracker.forget("w1");

    expect(tracker.idleOf("w1")).toBeNull();
    expect(tracker.isTracked("w1")).toBe(false);
    expect(tracker.due(T0 + 1000 * MINUTE)).toEqual([]);
  });

  it("5: due returns exactly the workspaces whose stop time passed, each with its key", () => {
    const { tracker, setNow } = trackerAt(T0);
    const keys = ["a", "b", "c"].map((lessonId) => ({ ...KEY, lessonId }));
    keys.forEach((key, index) => {
      setNow(T0 + index * 10 * MINUTE);
      tracker.touch(`w-${key.lessonId}`, key);
    });

    const due = tracker.due(T0 + 40 * MINUTE);

    expect(due).toEqual([
      { id: "w-a", key: keys[0] },
      { id: "w-b", key: keys[1] },
    ]);
  });

  it("6: an id never touched has no idle window", () => {
    const { tracker } = trackerAt(T0);

    expect(tracker.idleOf("never")).toBeNull();
    expect(tracker.isTracked("never")).toBe(false);
  });
});
