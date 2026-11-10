// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type FakeSocket,
  type Harness,
  harness,
  RIS,
  settle,
  T0,
  ticket,
  toAttachPending,
  toRunning,
} from "@/test/terminal-machine";

// U-machine, renewal (design 3.6.1 rows 18-30) and the G3/G6 switch to a renewal socket (A4-B1, A4-N3).

const RENEW_IN_MS = 60_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
});

/** Running on `old`, then the renewal timer fired: the renewal `openTerminal` is in flight (RN). */
async function toRenewing(h: Harness): Promise<FakeSocket> {
  const old = await toRunning(h, RENEW_IN_MS);
  vi.advanceTimersByTime(RENEW_IN_MS);
  return old;
}

/** As `toRenewing`, and the renewal ticket arrived: returns the old and the renewal socket. */
async function withRenewalSocket(h: Harness): Promise<{ old: FakeSocket; renewal: FakeSocket }> {
  const old = await toRenewing(h);
  h.lastOpen().resolve(ticket("t2", RENEW_IN_MS));
  await settle();
  return { old, renewal: h.lastSocket() };
}

describe("renewal timing", () => {
  it("renews renewInMs after the ticket arrived, not after attached", async () => {
    const h = harness();
    const socket = await toAttachPending(h, RENEW_IN_MS);
    vi.advanceTimersByTime(5000);
    socket.attached(false);

    vi.advanceTimersByTime(54_999);
    expect(h.opens).toHaveLength(1);
    vi.advanceTimersByTime(1);

    expect(h.opens).toHaveLength(2);
    expect(h.status()).toEqual({ kind: "running" });
  });

  it("never renews a ticket whose renewInMs is null", async () => {
    const h = harness();
    await toRunning(h, null);

    vi.advanceTimersByTime(10 * 60_000);

    expect(h.opens).toHaveLength(1);
  });

  it("sends input on the current socket while the renewal is in flight", async () => {
    const h = harness();
    const old = await toRenewing(h);

    h.machine.input("ls");

    expect(old.frames().at(-1)).toEqual({ t: "input", d: "ls" });
  });
});

describe("switch to the renewal socket (G3, G6)", () => {
  it("queues RIS and the snapshot after an old frame, and never credits the old bytes to the new socket", async () => {
    const h = harness();
    const { old, renewal } = await withRenewalSocket(h);

    old.output("old");
    renewal.attached(true);
    renewal.snapshot("snap");

    expect(h.terminal.log.slice(1)).toEqual([
      { op: "write", data: "bytes:old" },
      { op: "write", data: RIS },
      { op: "write", data: "snap" },
    ]);
    h.terminal.parse();
    vi.advanceTimersByTime(100);
    expect(renewal.frames()).toEqual([{ t: "resize", cols: 120, rows: 40 }]);
    expect(old.frames()).toEqual([{ t: "resize", cols: 120, rows: 40 }]);

    renewal.output("abc");
    h.terminal.parse();
    vi.advanceTimersByTime(100);
    expect(renewal.frames().at(-1)).toEqual({ t: "ack", n: 3 });
  });

  it("ignores the old socket's 4001 while the renewal socket exists and switches at attached", async () => {
    const h = harness();
    const { old, renewal } = await withRenewalSocket(h);

    old.closedBy(4001);
    expect(h.status()).toEqual({ kind: "running" });
    renewal.attached(false);

    expect(h.status()).toEqual({ kind: "running" });
    expect(h.terminal.writes().at(-1)).toBe(RIS);
    expect(renewal.frames()).toEqual([{ t: "resize", cols: 120, rows: 40 }]);
    h.machine.input("pwd");
    expect(renewal.frames().at(-1)).toEqual({ t: "input", d: "pwd" });
  });
});

describe("renewal outcomes (rows 20-29)", () => {
  it("reports an expired session when the renewal answers unauthenticated", async () => {
    const h = harness();
    await toRenewing(h);

    h.lastOpen().resolve({ kind: "unauthenticated" });
    await settle();

    expect(h.sessionExpired).toHaveBeenCalledTimes(1);
    expect(h.status()).toEqual({ kind: "session-expired", shown: { kind: "running" } });
  });

  it("retries a failed renewal every 15 s only while the deadline is more than 15 s away", async () => {
    const h = harness();
    await toRenewing(h);

    // Deadline: received at 0 + renewInMs 60 s + 60 s margin = 120 s. Failures at 60, 75, 90 and 105 s.
    for (let failure = 0; failure < 4; failure += 1) {
      h.lastOpen().resolve({ kind: "failed" });
      await settle();
      vi.advanceTimersByTime(15_000);
    }
    vi.advanceTimersByTime(100_000);

    expect(h.opens).toHaveLength(5);
    expect(h.status()).toEqual({ kind: "running" });
  });

  it("treats a 4001 while only the renewal request is in flight as a takeover and opens no socket later", async () => {
    const h = harness();
    const old = await toRenewing(h);

    old.closedBy(4001);
    h.lastOpen().resolve(ticket("t2", RENEW_IN_MS));
    await settle();

    expect(h.status()).toEqual({ kind: "taken-over" });
    expect(h.sockets).toHaveLength(1);
  });

  it("shows the takeover when the renewal socket gets 4001 before attached", async () => {
    const h = harness();
    const { old, renewal } = await withRenewalSocket(h);

    renewal.closedBy(4001);

    expect(h.status()).toEqual({ kind: "taken-over" });
    expect(old.closeCalls).toBe(1);
  });

  it("shows the exited shell when the renewal socket gets 4000 before attached", async () => {
    const h = harness();
    const { renewal } = await withRenewalSocket(h);

    renewal.closedBy(4000);

    expect(h.status()).toEqual({ kind: "shell-exited" });
  });

  it("closes a renewal socket whose attached does not come in 10 s and retries the renewal later", async () => {
    const h = harness();
    const { renewal } = await withRenewalSocket(h);

    vi.advanceTimersByTime(10_000);
    expect(renewal.closeCalls).toBe(1);
    expect(h.status()).toEqual({ kind: "running" });
    vi.advanceTimersByTime(15_000);

    expect(h.opens).toHaveLength(3);
  });

  it("reconnects when the renewal socket fails after the old one was taken over", async () => {
    const h = harness();
    const { old, renewal } = await withRenewalSocket(h);

    old.closedBy(4001);
    renewal.closedBy(1006);

    expect(h.status()).toEqual({ kind: "reconnecting" });
    vi.advanceTimersByTime(1000);
    expect(h.opens).toHaveLength(3);
  });

  it("shows the lost connection and drops input when the old socket drops during the renewal, then reconnects when the renewal fails", async () => {
    const h = harness();
    const old = await toRenewing(h);

    old.closedBy(1006);
    h.machine.input("lost");
    expect(h.status()).toEqual({ kind: "reconnecting" });
    expect(old.frames()).toEqual([{ t: "resize", cols: 120, rows: 40 }]);
    h.lastOpen().reject(new Error("network"));
    await settle();

    expect(h.status()).toEqual({ kind: "reconnecting" });
    vi.advanceTimersByTime(1000);
    expect(h.opens).toHaveLength(3);
  });

  it("switches to the renewal after the old socket dropped during the renewal", async () => {
    const h = harness();
    const old = await toRenewing(h);
    old.closedBy(1006);
    h.lastOpen().resolve(ticket("t2", RENEW_IN_MS));
    await settle();

    h.lastSocket().attached(false);

    expect(h.status()).toEqual({ kind: "running" });
  });
});
