// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { harness, RUNNING, settle, T0, ticket, toRunning } from "@/test/terminal-machine";

// U-machine, restart and reset (#106 design 3.2): both leave a running environment through ST, drop the old
// connection before the server call, and only a reset that answered running shows the reset note.

const RENEW_IN_MS = 60_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("restart and reset", () => {
  it("restarts from running through starting and never shows the stop of the old socket", async () => {
    const h = harness();
    const old = await toRunning(h);

    h.machine.restart();

    expect(h.status()).toMatchObject({ kind: "starting", copy: "starting" });
    expect(old.closeCalls).toBe(1);
    expect(h.restarts).toHaveLength(1);
    old.closedBy(4002);
    h.restarts[0]?.resolve(RUNNING);
    await settle();
    h.lastOpen().resolve(ticket("t2"));
    await settle();
    h.lastSocket().attached(false);
    expect(h.status()).toEqual({ kind: "running" });
    expect(h.statuses.map((status) => status.kind)).not.toContain("stopped");
  });

  it("resets with the creating copy and keeps the reset note until the status changes", async () => {
    const h = harness();
    await toRunning(h);

    h.machine.reset();

    expect(h.status()).toMatchObject({ kind: "starting", copy: "creating" });
    expect(h.resets).toHaveLength(1);
    h.resets[0]?.resolve(RUNNING);
    await settle();
    expect(h.status()).toEqual({ kind: "connecting", note: "workspace-reset" });
    h.lastOpen().resolve(ticket("t2"));
    await settle();
    const socket = h.lastSocket();
    socket.attached(false);
    expect(h.status()).toEqual({ kind: "running", note: "workspace-reset" });
    socket.closedBy(1006);
    expect(h.status()).toEqual({ kind: "reconnecting" });
    vi.advanceTimersByTime(1000);
    h.lastOpen().resolve(ticket("t3"));
    await settle();
    h.lastSocket().attached(false);
    expect(h.status()).toEqual({ kind: "running" });
    expect(h.status()).not.toHaveProperty("note");
  });

  it("shows a failed reset as its failure and an unauthenticated one as an expired session", async () => {
    const failing = harness();
    await toRunning(failing);
    failing.machine.reset();
    failing.resets[0]?.resolve({ kind: "docker-down" });
    await settle();

    const expiring = harness();
    await toRunning(expiring);
    expiring.machine.reset();
    expiring.resets[0]?.resolve({ kind: "unauthenticated" });
    await settle();

    expect(failing.status()).toEqual({ kind: "failed", failure: { kind: "docker-down" } });
    expect(expiring.status()).toMatchObject({ kind: "session-expired" });
    expect(expiring.sessionExpired).toHaveBeenCalledTimes(1);
  });

  it("does nothing while the environment is stopped or still starting", async () => {
    const stopped = harness();
    const socket = await toRunning(stopped);
    socket.closedBy(4002);
    stopped.peeks[1]?.resolve({ kind: "stopped" });
    await settle();
    const starting = harness();
    starting.machine.mount();
    const stoppedBefore = stopped.status();
    const startingBefore = starting.status();

    for (const h of [stopped, starting]) {
      h.machine.restart();
      h.machine.reset();
    }

    expect(stopped.restarts).toEqual([]);
    expect(stopped.resets).toEqual([]);
    expect(stopped.status()).toEqual(stoppedBefore);
    expect(starting.restarts).toEqual([]);
    expect(starting.resets).toEqual([]);
    expect(starting.status()).toEqual(startingBefore);
  });

  it("drops a renewal in flight, so its late ticket opens no socket and its timer never fires", async () => {
    const h = harness();
    await toRunning(h, RENEW_IN_MS);
    vi.advanceTimersByTime(RENEW_IN_MS);
    const renewal = h.lastOpen();
    const socketsBefore = h.sockets.length;

    h.machine.restart();
    renewal.resolve(ticket("late", RENEW_IN_MS));
    await settle();
    const opensAfterRestart = h.opens.length;
    vi.advanceTimersByTime(10 * RENEW_IN_MS);

    expect(h.sockets).toHaveLength(socketsBefore);
    expect(h.opens).toHaveLength(opensAfterRestart);
  });

  it("shows a rejected restart as a failed start", async () => {
    const h = harness();
    await toRunning(h);

    h.machine.restart();
    h.restarts[0]?.reject(new Error("network"));
    await settle();

    expect(h.status()).toEqual({ kind: "failed", failure: { kind: "start-failed" } });
  });

  it("opens nothing when the restart answers after an unmount", async () => {
    const h = harness();
    await toRunning(h);
    h.machine.restart();
    const opensBefore = h.opens.length;

    h.machine.unmount();
    h.restarts[0]?.resolve(RUNNING);
    await settle();

    expect(h.opens).toHaveLength(opensBefore);
  });

  it("ignores restart and reset after an unmount even though the kept status reads running", async () => {
    const h = harness();
    await toRunning(h);
    h.machine.unmount();
    const statusesBefore = h.statuses.length;

    h.machine.restart();
    h.machine.reset();

    expect(h.status()).toEqual({ kind: "running" });
    expect(h.restarts).toEqual([]);
    expect(h.resets).toEqual([]);
    expect(h.statuses).toHaveLength(statusesBefore);
  });
});
