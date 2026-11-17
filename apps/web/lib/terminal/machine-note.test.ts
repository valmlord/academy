// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EnvironmentResult } from "@/lib/workspace/environment";
import {
  type Harness,
  harness,
  RUNNING,
  settle,
  T0,
  ticket,
  toRunning,
} from "@/test/terminal-machine";

// U-machine, the recreated working folder note (#150): a start or restart whose result says the folder was
// recreated shows "volume-recreated" on connecting and running, until the first status that is neither, or the
// next restart or reset.

const RECREATED: EnvironmentResult = {
  kind: "running",
  outcome: "created",
  isVolumeRecreated: true,
};
const CREATED: EnvironmentResult = {
  kind: "running",
  outcome: "created",
  isVolumeRecreated: false,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
});

/** Page open on a lesson whose workspace is gone: the peek answers absent and the start answers `result`. */
async function openAbsent(h: Harness, result: EnvironmentResult): Promise<void> {
  h.machine.mount();
  h.peeks[0]?.resolve({ kind: "absent" });
  await settle();
  h.starts[0]?.resolve(result);
  await settle();
}

/** The terminal of the running environment opens and attaches. */
async function attach(h: Harness, name: string): Promise<void> {
  h.lastOpen().resolve(ticket(name));
  await settle();
  h.lastSocket().attached(false);
}

describe("recreated working folder note", () => {
  it("shows the recreated note on connecting and running after a page open, and not after a lost connection", async () => {
    const h = harness();

    await openAbsent(h, RECREATED);
    const connecting = h.status();
    await attach(h, "t1");
    const running = h.status();
    h.lastSocket().closedBy(1006);
    const reconnecting = h.status();
    vi.advanceTimersByTime(1000);
    await attach(h, "t2");

    expect(connecting).toEqual({ kind: "connecting", note: "volume-recreated" });
    expect(running).toEqual({ kind: "running", note: "volume-recreated" });
    expect(reconnecting).toEqual({ kind: "reconnecting" });
    expect(h.status()).toEqual({ kind: "running" });
  });

  it("shows no note on a first visit whose start created the workspace", async () => {
    const h = harness();

    await openAbsent(h, CREATED);
    await attach(h, "t1");

    expect(h.status()).toEqual({ kind: "running" });
    expect(h.status()).not.toHaveProperty("note");
    expect(h.statuses.some((status) => "note" in status)).toBe(false);
  });

  it("shows the recreated note after start again from a stopped environment", async () => {
    const h = harness();
    h.machine.mount();
    h.peeks[0]?.resolve(RUNNING);
    await settle();
    h.lastOpen().resolve({ kind: "stopped" });
    await settle();
    expect(h.status()).toEqual({ kind: "stopped", isMemoryLimit: false });

    h.machine.act();
    h.starts[0]?.resolve(RECREATED);
    await settle();
    await attach(h, "t2");

    expect(h.status()).toEqual({ kind: "running", note: "volume-recreated" });
  });

  it("shows the recreated note after a menu restart, and the reset note after the next reset even when it says recreated", async () => {
    const h = harness();
    await toRunning(h);

    h.machine.restart();
    h.restarts[0]?.resolve(RECREATED);
    await settle();
    await attach(h, "t2");
    const afterRestart = h.status();
    h.machine.reset();
    const resetting = h.status();
    h.resets[0]?.resolve(RECREATED);
    await settle();
    await attach(h, "t3");

    expect(afterRestart).toEqual({ kind: "running", note: "volume-recreated" });
    expect(resetting).toMatchObject({ kind: "starting", copy: "creating" });
    expect(h.status()).toEqual({ kind: "running", note: "workspace-reset" });
  });

  it("clears the recreated note at the next restart that answers not recreated", async () => {
    const h = harness();
    await openAbsent(h, RECREATED);
    await attach(h, "t1");

    h.machine.restart();
    h.restarts[0]?.resolve(RUNNING);
    await settle();
    const connecting = h.status();
    await attach(h, "t2");

    expect(connecting).toEqual({ kind: "connecting" });
    expect(h.status()).toEqual({ kind: "running" });
  });

  it("ends the recreated note with a stop and does not bring it back after start again answers not recreated", async () => {
    const h = harness();
    await openAbsent(h, RECREATED);
    await attach(h, "t1");

    h.lastSocket().closedBy(4002);
    const stopped = h.status();
    h.peeks[1]?.resolve({ kind: "stopped" });
    await settle();
    h.machine.act();
    h.starts[1]?.resolve(RUNNING);
    await settle();
    await attach(h, "t2");

    expect(stopped).toEqual({ kind: "stopped", isMemoryLimit: false });
    expect(h.status()).toEqual({ kind: "running" });
  });
});
