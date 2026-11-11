import { afterEach, describe, expect, it, vi } from "vitest";
import { DockerUnavailableError } from "../../../src/errors.js";
import {
  ID,
  KEY,
  type TerminalSetup,
  terminalSetup,
  texts,
  waitForAttached,
} from "../../support/terminal.js";

// U-stopping (design 3.2.1 rows 5a, 22, 22a, 23) and U-activity (rows 15, 16, 20), design 10.1.

const MINUTE = 60_000;
const IDLE_STOP_MS = 30 * MINUTE;

let setup: TerminalSetup | undefined;

async function start(options: Parameters<typeof terminalSetup>[0] = {}): Promise<TerminalSetup> {
  setup = await terminalSetup(options);
  return setup;
}

afterEach(async () => {
  await setup?.close();
  setup = undefined;
});

/**
 * Docker reports the container as running until its last process is gone, while the exec stream may already
 * have ended; the fake runtime marks it stopped at once, so the test puts it back to model that window. Only
 * the stopping mark can then turn the exec end into 4002.
 */
async function reportStillRunning(current: TerminalSetup): Promise<void> {
  const info = await current.runtime.inspect(KEY);
  // A removed workspace has nothing left to report; its end is 4002 either way.
  if (info !== null) current.runtime.seed({ ...info, state: "running" });
}

describe("stops and the terminal (U-stopping)", () => {
  it.each([
    ["stop", (current: TerminalSetup) => current.manager.stop(KEY).then(() => undefined)],
    ["remove", (current: TerminalSetup) => current.manager.remove(KEY)],
    [
      "idle stop",
      (current: TerminalSetup) => {
        current.clock.now += IDLE_STOP_MS;
        return current.manager.sweepIdle();
      },
    ],
  ])(
    "a %s marks the live session: attaches get 4002 and the exec end is 4002",
    async (_name, stop) => {
      const current = await start();
      const client = await current.connect();
      await waitForAttached(client);

      await stop(current);
      const late = await current.connect();
      const lateClosed = await late.closed;
      await reportStillRunning(current);
      current.shell().exitCode = 0;
      current.shell().peer.end();

      expect(lateClosed).toEqual({ code: 4002, reason: "environment stopped" });
      expect(await client.closed).toEqual({ code: 4002, reason: "environment stopped" });
      expect(current.shell().terminations).toBe(0);
    },
  );

  it("clears the mark when the stop rejects, so the next attach is attached", async () => {
    const current = await start();
    const first = await current.connect();
    await waitForAttached(first);
    vi.spyOn(current.runtime, "stop").mockRejectedValueOnce(
      new DockerUnavailableError("stop container", "ECONNREFUSED"),
    );

    await expect(current.manager.stop(KEY)).rejects.toBeInstanceOf(DockerUnavailableError);
    const second = await current.connect();
    await waitForAttached(second);

    expect(texts(second)[0]).toEqual({ t: "attached", resumed: true });
    expect((await first.closed).code).toBe(4001);
  });

  it("marks nothing when there is no session, so a later session attaches normally", async () => {
    const current = await start();

    await current.manager.stop(KEY);
    await current.manager.ensure(KEY);
    const first = await current.connect();
    await waitForAttached(first);
    const second = await current.connect();
    await waitForAttached(second);

    expect(texts(first)[0]).toEqual({ t: "attached", resumed: false });
    expect((await first.closed).code).toBe(4001);
    expect(texts(second)[0]).toEqual({ t: "attached", resumed: true });
  });
});

describe("terminal activity (U-activity)", () => {
  function stopAt(current: TerminalSetup): number | undefined {
    return current.tracker.idleOf(ID)?.stopAt;
  }

  it("moves the idle window on input and on resize", async () => {
    const current = await start();
    const client = await current.connect();
    await waitForAttached(client);

    current.clock.now += MINUTE;
    client.send({ t: "input", d: "ls\r" });
    await vi.waitFor(() => expect(stopAt(current)).toBe(current.clock.now + IDLE_STOP_MS));
    current.clock.now += MINUTE;
    client.send({ t: "resize", cols: 100, rows: 30 });

    await vi.waitFor(() => expect(stopAt(current)).toBe(current.clock.now + IDLE_STOP_MS));
  });

  it("moves the idle window on output only while a client is attached", async () => {
    const current = await start();
    const client = await current.connect();
    await waitForAttached(client);
    const screen = current.screens[0];

    current.clock.now += MINUTE;
    current.shell().peer.write("attached output\r\n");
    await vi.waitFor(() => expect(client.output()).toContain("attached output"));
    const touchedAt = current.clock.now;
    await current.leave(client);
    current.clock.now += MINUTE;
    current.shell().peer.write("detached output\r\n");
    await vi.waitFor(() => expect(screen?.text).toContain("detached output"));

    expect(stopAt(current)).toBe(touchedAt + IDLE_STOP_MS);
  });

  it("does not move the idle window on output while the attach is pending", async () => {
    const current = await start({ deferScreen: true });
    const client = await current.connect();
    await vi.waitFor(() => expect(current.screens).toHaveLength(1));
    const before = stopAt(current);

    current.clock.now += MINUTE;
    current.shell().peer.write("pending output\r\n");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(stopAt(current)).toBe(before);
    expect(texts(client)).toEqual([]);
  });

  it("ignores activity of a workspace the idle tracker does not know", async () => {
    const current = await start();
    const client = await current.connect();
    await waitForAttached(client);
    current.tracker.forget(ID);

    client.send({ t: "input", d: "ls\r" });
    client.send({ t: "resize", cols: 100, rows: 30 });
    await vi.waitFor(() => expect(current.shell().resizes).toEqual(["100x30"]));

    expect(current.tracker.isTracked(ID)).toBe(false);
  });
});
