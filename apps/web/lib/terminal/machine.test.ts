// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type FakeSocket,
  harness,
  RIS,
  RUNNING,
  settle,
  T0,
  ticket,
  toAttachPending,
  toRunning,
} from "@/test/terminal-machine";

// U-machine (design 10.3 and Delta 2 section 2.2): the browser terminal state machine of 3.6.1, one group of
// rows per describe. The slow threshold is 7 s, not the default 10.

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("page open (rows 0a-0h)", () => {
  it("peeks on mount and, for a workspace never created, starts it with the creating copy", async () => {
    const h = harness();

    h.machine.mount();
    h.peeks[0]?.resolve({ kind: "absent" });
    await settle();

    expect(h.starts).toHaveLength(1);
    expect(h.status()).toMatchObject({ kind: "starting", copy: "creating" });
  });

  it("starts a stopped environment on open", async () => {
    const h = harness();

    h.machine.mount();
    h.peeks[0]?.resolve({ kind: "stopped" });
    await settle();

    expect(h.starts).toHaveLength(1);
    expect(h.status()).toMatchObject({ kind: "starting", copy: "starting" });
  });

  it("opens the terminal without a start when the environment already runs", async () => {
    const h = harness();

    h.machine.mount();
    h.peeks[0]?.resolve(RUNNING);
    await settle();

    expect(h.starts).toHaveLength(0);
    expect(h.opens).toHaveLength(1);
    expect(h.status()).toEqual({ kind: "connecting" });
  });

  it("adds the slow note at the configured threshold, not before", () => {
    const h = harness({ startSlowSeconds: 7 });
    h.machine.mount();

    vi.advanceTimersByTime(6999);
    expect(h.status()).toMatchObject({ kind: "starting", isSlow: false });
    vi.advanceTimersByTime(1);

    expect(h.status()).toMatchObject({ kind: "starting", isSlow: true });
  });

  it("counts the start timer from the page open", () => {
    const h = harness();
    vi.advanceTimersByTime(2500);

    h.machine.mount();

    expect(h.status()).toMatchObject({ kind: "starting", startedAt: 2500 });
  });

  it("clears the slow timer when the start answers before the threshold", async () => {
    const h = harness({ startSlowSeconds: 7 });
    h.machine.mount();
    h.peeks[0]?.resolve({ kind: "stopped" });
    await settle();

    vi.advanceTimersByTime(3000);
    h.starts[0]?.resolve({ kind: "running", outcome: "started" });
    await settle();
    // Only the slow timer could be armed here: openTerminal is still in flight.
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10_000);

    expect(h.statuses.some((status) => status.kind === "starting" && status.isSlow)).toBe(false);
    expect(h.status()).toEqual({ kind: "connecting" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("drops the peek result after unmount and leaves no timer", async () => {
    const h = harness();
    h.machine.mount();

    h.machine.unmount();
    h.peeks[0]?.resolve(RUNNING);
    await settle();

    expect(h.opens).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports an expired session when the peek answers unauthenticated", async () => {
    const h = harness();
    h.machine.mount();

    h.peeks[0]?.resolve({ kind: "unauthenticated" });
    await settle();

    expect(h.sessionExpired).toHaveBeenCalledTimes(1);
    expect(h.status()).toMatchObject({ kind: "session-expired", shown: { kind: "starting" } });
  });

  it("shows Docker down when the start answers docker-down", async () => {
    const h = harness();
    h.machine.mount();
    h.peeks[0]?.resolve({ kind: "stopped" });
    await settle();

    h.starts[0]?.resolve({ kind: "docker-down" });
    await settle();

    expect(h.status()).toEqual({ kind: "failed", failure: { kind: "docker-down" } });
  });

  it("shows a failed start when the start action rejects", async () => {
    const h = harness();
    h.machine.mount();
    h.peeks[0]?.resolve({ kind: "absent" });
    await settle();

    h.starts[0]?.reject(new Error("network"));
    await settle();

    expect(h.status()).toEqual({ kind: "failed", failure: { kind: "start-failed" } });
  });
});

describe("connecting (rows 1-5)", () => {
  it("opens a socket for the ticket and waits for attached", async () => {
    const h = harness();

    const socket = await toAttachPending(h);

    expect(socket.ticket).toBe("t1");
    expect(socket.sent).toEqual([]);
    expect(h.status()).toEqual({ kind: "connecting" });
  });

  it("reports an expired session when openTerminal answers unauthenticated", async () => {
    const h = harness();
    h.machine.mount();
    h.peeks[0]?.resolve(RUNNING);
    await settle();

    h.lastOpen().resolve({ kind: "unauthenticated" });
    await settle();

    expect(h.sessionExpired).toHaveBeenCalledTimes(1);
    expect(h.status()).toEqual({ kind: "session-expired", shown: { kind: "connecting" } });
  });

  it("shows the memory-limit stop when openTerminal answers limits", async () => {
    const h = harness();
    h.machine.mount();
    h.peeks[0]?.resolve(RUNNING);
    await settle();

    h.lastOpen().resolve({ kind: "limits" });
    await settle();

    expect(h.status()).toEqual({ kind: "stopped", isMemoryLimit: true });
  });

  it("names the missing image when openTerminal answers image-missing", async () => {
    const h = harness();
    h.machine.mount();
    h.peeks[0]?.resolve(RUNNING);
    await settle();

    h.lastOpen().resolve({ kind: "image-missing", image: "academy-workspace:dev" });
    await settle();

    expect(h.status()).toEqual({
      kind: "failed",
      failure: { kind: "image-missing", image: "academy-workspace:dev" },
    });
  });

  it("retries a rejected openTerminal with backoff and fails after N attempts", async () => {
    const h = harness({ reconnectAttempts: 2 });
    h.machine.mount();
    h.peeks[0]?.resolve(RUNNING);
    await settle();

    h.lastOpen().reject(new Error("network"));
    await settle();
    expect(h.status()).toEqual({ kind: "reconnecting" });
    vi.advanceTimersByTime(999);
    expect(h.opens).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(h.opens).toHaveLength(2);
    h.lastOpen().reject(new Error("network"));
    await settle();
    vi.advanceTimersByTime(1999);
    expect(h.opens).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(h.opens).toHaveLength(3);
    h.lastOpen().reject(new Error("network"));
    await settle();

    expect(h.status()).toEqual({ kind: "failed", failure: { kind: "reconnect-failed" } });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("attach pending (rows 6-9)", () => {
  it("writes RIS and sends the fitted size first after a fresh attach", async () => {
    const h = harness();
    const socket = await toAttachPending(h);

    socket.attached(false);

    expect(h.terminal.log).toEqual([{ op: "write", data: RIS }]);
    expect(socket.frames()[0]).toEqual({ t: "resize", cols: 120, rows: 40 });
    expect(h.status()).toEqual({ kind: "running" });
  });

  it("writes RIS then the snapshot after a resumed attach, and resizes only after the snapshot", async () => {
    const h = harness();
    const socket = await toAttachPending(h);

    socket.attached(true);
    expect(socket.sent).toEqual([]);
    socket.snapshot("screen-before");

    expect(h.terminal.log).toEqual([
      { op: "write", data: RIS },
      { op: "write", data: "screen-before" },
    ]);
    expect(socket.frames()).toEqual([{ t: "resize", cols: 120, rows: 40 }]);
  });

  it("reconnects when the snapshot never arrives within 10 s", async () => {
    const h = harness();
    const socket = await toAttachPending(h);
    socket.attached(true);

    vi.advanceTimersByTime(10_000);

    expect(h.status()).toEqual({ kind: "reconnecting" });
    expect(socket.closeCalls).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(h.opens).toHaveLength(2);
  });

  it("ignores a snapshot that is not awaited", async () => {
    const h = harness();
    const socket = await toRunning(h);

    socket.snapshot("late");

    expect(h.terminal.writes()).toEqual([RIS]);
  });

  it("shows the exited shell on 4000 before attached", async () => {
    const h = harness();
    const socket = await toAttachPending(h);

    socket.closedBy(4000);

    expect(h.status()).toEqual({ kind: "shell-exited" });
  });

  it("shows the stop on 4002 before attached and refines it to the memory limit by a peek", async () => {
    const h = harness();
    const socket = await toAttachPending(h);

    socket.closedBy(4002);
    expect(h.status()).toEqual({ kind: "stopped", isMemoryLimit: false });
    h.peeks[1]?.resolve({ kind: "limits" });
    await settle();

    expect(h.status()).toEqual({ kind: "stopped", isMemoryLimit: true });
  });

  it("shows the takeover on 4001 before attached", async () => {
    const h = harness();
    const socket = await toAttachPending(h);

    socket.closedBy(4001);

    expect(h.status()).toEqual({ kind: "taken-over" });
  });

  it("retries after another close code before attached", async () => {
    const h = harness();
    const socket = await toAttachPending(h);

    socket.closedBy(1006);

    expect(h.status()).toEqual({ kind: "reconnecting" });
    vi.advanceTimersByTime(1000);
    expect(h.opens).toHaveLength(2);
  });

  it("closes the socket and retries when attached does not arrive within 10 s", async () => {
    const h = harness();
    const socket = await toAttachPending(h);

    vi.advanceTimersByTime(10_000);

    expect(socket.closeCalls).toBe(1);
    expect(h.status()).toEqual({ kind: "reconnecting" });
  });
});

describe("running (rows 10-17, 32)", () => {
  it("writes output and acks its byte count 100 ms after xterm parsed it", async () => {
    const h = harness();
    const socket = await toRunning(h);

    socket.output("hello");
    h.terminal.parse();
    vi.advanceTimersByTime(99);
    expect(socket.frames()).toHaveLength(1);
    vi.advanceTimersByTime(1);

    expect(h.terminal.writes()).toEqual([RIS, "bytes:hello"]);
    expect(socket.frames().at(-1)).toEqual({ t: "ack", n: 5 });
  });

  it("sends input in chunks of at most 8192 units", async () => {
    const h = harness();
    const socket = await toRunning(h);

    h.machine.input("x".repeat(20_000));

    expect(socket.frames().slice(1)).toEqual([
      { t: "input", d: "x".repeat(8192) },
      { t: "input", d: "x".repeat(8192) },
      { t: "input", d: "x".repeat(3616) },
    ]);
  });

  it("sends one resize 100 ms after the last fit change", async () => {
    const h = harness();
    const socket = await toRunning(h);

    h.size.cols = 90;
    h.machine.fitChanged();
    vi.advanceTimersByTime(50);
    h.size.cols = 80;
    h.machine.fitChanged();
    vi.advanceTimersByTime(100);

    expect(socket.frames().slice(1)).toEqual([{ t: "resize", cols: 80, rows: 40 }]);
  });

  it("drops input while reconnecting and while the snapshot is awaited", async () => {
    const h = harness();
    const socket = await toAttachPending(h);
    socket.attached(true);

    h.machine.input("lost");
    socket.closedBy(1006);
    h.machine.input("lost too");

    expect(socket.sent).toEqual([]);
  });

  it("shows the exited shell on 4000", async () => {
    const h = harness();
    const socket = await toRunning(h);

    socket.closedBy(4000);

    expect(h.status()).toEqual({ kind: "shell-exited" });
  });

  it("applies the peek issued by a 4002 close and shows the memory-limit copy", async () => {
    const h = harness();
    const socket = await toRunning(h);

    socket.closedBy(4002);
    h.peeks[1]?.resolve({ kind: "limits" });
    await settle();

    expect(h.status()).toEqual({ kind: "stopped", isMemoryLimit: true });
  });

  it("shows the takeover on 4001 and never renews afterwards", async () => {
    const h = harness();
    const socket = await toRunning(h, 60_000);

    socket.closedBy(4001);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(120_000);

    expect(h.status()).toEqual({ kind: "taken-over" });
    expect(h.opens).toHaveLength(1);
  });

  it("reconnects 1 s after any other close code", async () => {
    const h = harness();
    const socket = await toRunning(h);

    socket.closedBy(1011);
    vi.advanceTimersByTime(999);
    expect(h.opens).toHaveLength(1);
    vi.advanceTimersByTime(1);

    expect(h.opens).toHaveLength(2);
    expect(h.status()).toEqual({ kind: "connecting" });
  });
});

describe("generation (G1)", () => {
  it("opens no socket when the ticket arrives after unmount", async () => {
    const h = harness();
    h.machine.mount();
    h.peeks[0]?.resolve(RUNNING);
    await settle();

    h.machine.unmount();
    h.lastOpen().resolve(ticket("t1"));
    await settle();

    expect(h.sockets).toHaveLength(0);
  });

  it("ignores the stop's peek once start again started the environment again", async () => {
    const h = harness();
    const socket = await toRunning(h);
    socket.closedBy(4002);

    h.machine.act();
    h.peeks[1]?.resolve({ kind: "limits" });
    await settle();

    expect(h.status()).toMatchObject({ kind: "starting" });
    expect(h.starts).toHaveLength(1);
  });
});

describe("user actions and unmount (rows 33-38)", () => {
  it("opens the terminal again on open here after a takeover", async () => {
    const h = harness();
    const socket = await toRunning(h);
    socket.closedBy(4001);

    h.machine.act();

    expect(h.opens).toHaveLength(2);
    expect(h.status()).toEqual({ kind: "connecting" });
  });

  it("opens a new session on open a new session after the shell exited", async () => {
    const h = harness();
    const socket = await toRunning(h);
    socket.closedBy(4000);

    h.machine.act();

    expect(h.opens).toHaveLength(2);
  });

  it("starts the environment on start again and opens the terminal once it runs", async () => {
    const h = harness();
    const socket = await toRunning(h);
    socket.closedBy(4002);

    h.machine.act();
    expect(h.status()).toMatchObject({ kind: "starting", copy: "starting", isSlow: false });
    h.starts[0]?.resolve({ kind: "running", outcome: "started" });
    await settle();

    expect(h.opens).toHaveLength(2);
  });

  it("reconnects without a start on reconnect after the reconnect failed", async () => {
    const h = harness({ reconnectAttempts: 1 });
    const socket = await toRunning(h);
    socket.closedBy(1006);
    vi.advanceTimersByTime(1000);
    h.lastOpen().reject(new Error("network"));
    await settle();
    expect(h.status()).toEqual({ kind: "failed", failure: { kind: "reconnect-failed" } });

    h.machine.act();

    expect(h.starts).toHaveLength(0);
    expect(h.opens).toHaveLength(3);
  });

  it("starts the environment again on retry after a failed start", async () => {
    const h = harness();
    h.machine.mount();
    h.peeks[0]?.resolve({ kind: "failed" });
    await settle();

    h.machine.act();

    expect(h.starts).toHaveLength(1);
    expect(h.status()).toMatchObject({ kind: "starting" });
  });

  it("does nothing on the status action of a rejected environment (the action is a link)", async () => {
    const h = harness();
    h.machine.mount();
    h.peeks[0]?.resolve({ kind: "rejected" });
    await settle();

    h.machine.act();

    expect(h.starts).toHaveLength(0);
    expect(h.opens).toHaveLength(0);
  });

  it("stays in the expired session whatever happens next", async () => {
    const h = harness();
    h.machine.mount();
    h.peeks[0]?.resolve({ kind: "unauthenticated" });
    await settle();

    h.machine.act();
    vi.advanceTimersByTime(60_000);

    expect(h.status().kind).toBe("session-expired");
    expect(h.opens).toHaveLength(0);
  });

  it("closes every socket, clears every timer and disposes the terminal last on unmount", async () => {
    const h = harness();
    const old = await toRenewing(h);
    h.lastOpen().resolve(ticket("t2", 60_000));
    await settle();
    old.output("x");
    h.terminal.parse();
    h.machine.fitChanged();

    h.machine.unmount();

    expect(old.closeCalls).toBe(1);
    expect(h.lastSocket().closeCalls).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(h.terminal.log.at(-1)).toEqual({ op: "dispose" });
  });
});

async function toRenewing(h: ReturnType<typeof harness>): Promise<FakeSocket> {
  const old = await toRunning(h, 60_000);
  vi.advanceTimersByTime(60_000);
  return old;
}
