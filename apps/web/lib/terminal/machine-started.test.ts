// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { harness, settle, T0, toAttachPending, toRunning } from "@/test/terminal-machine";

// U-started-client (design 3.4, 10.3): the browser records the lesson as started on the first key or paste it
// actually sends, never on mount, attach or xterm's own replies, and retries a failure at most once per 30 s.

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("recordLessonStarted (U-started-client)", () => {
  it("is not called on mount or attach", async () => {
    const h = harness();

    await toRunning(h);

    expect(h.records).toHaveLength(0);
  });

  it("is not called for terminal data alone, such as xterm's cursor-position reply", async () => {
    const h = harness();
    const socket = await toRunning(h);

    h.machine.input("\x1b[1;1R");

    expect(socket.frames().at(-1)).toEqual({ t: "input", d: "\x1b[1;1R" });
    expect(h.records).toHaveLength(0);
  });

  it("is not called for a key typed before the terminal runs", async () => {
    const h = harness();
    await toAttachPending(h);

    h.machine.userInput();

    expect(h.records).toHaveLength(0);
  });

  it("is not called for a key typed while the snapshot is awaited", async () => {
    const h = harness();
    const socket = await toAttachPending(h);
    socket.attached(true);

    h.machine.userInput();

    expect(h.records).toHaveLength(0);
  });

  it("is called exactly once for the first keys or pastes sent while running", async () => {
    const h = harness();
    await toRunning(h);

    h.machine.userInput();
    h.machine.userInput();
    h.records[0]?.resolve({ kind: "recorded" });
    await settle();
    h.machine.userInput();

    expect(h.records).toHaveLength(1);
  });

  it("retries a failed call on a later key, no sooner than 30 s after the failure", async () => {
    const h = harness();
    await toRunning(h);
    h.machine.userInput();
    h.records[0]?.resolve({ kind: "failed" });
    await settle();

    vi.advanceTimersByTime(29_999);
    h.machine.userInput();
    expect(h.records).toHaveLength(1);
    vi.advanceTimersByTime(1);
    h.machine.userInput();

    expect(h.records).toHaveLength(2);
  });

  it("changes nothing when its result arrives after unmount", async () => {
    const h = harness();
    await toRunning(h);
    h.machine.userInput();

    h.machine.unmount();
    h.records[0]?.reject(new Error("network"));
    await settle();
    h.machine.userInput();

    expect(h.records).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
