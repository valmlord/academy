import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DockerApiError,
  DockerResponseShapeError,
  DockerUnavailableError,
} from "../../../src/errors.js";
import {
  type FakeScreen,
  ID,
  KEY,
  processErrorSpy,
  type TerminalSetup,
  terminalSetup,
  texts,
  waitForAttached,
} from "../../support/terminal.js";

// U-session-end (design 3.2.1 rows 2, 21, 24; 3.2.2 C5, C9), U-resize-error (row 16, C1), design 10.1, and
// U-kill (#110).

/** Arbitrary under the fake clock; the test advances three of these. */
const HEARTBEAT_MS = 100;

let setup: TerminalSetup | undefined;
let spy: ReturnType<typeof processErrorSpy> | undefined;

async function start(options: Parameters<typeof terminalSetup>[0] = {}): Promise<TerminalSetup> {
  spy = processErrorSpy();
  setup = await terminalSetup(options);
  return setup;
}

afterEach(async () => {
  vi.useRealTimers();
  await setup?.close();
  setup = undefined;
  spy?.stop();
  spy = undefined;
});

function endLines(logged: readonly string[]): string[] {
  return logged.filter((line) => line.startsWith(`terminal ${ID} `) && line.includes(": ended "));
}

/**
 * The common afterwards of every end path: nothing left in the service, the shell killed `kills` times, and a
 * second end is a no-op (it kills no second time either).
 */
async function expectFullyEnded(
  current: TerminalSetup,
  screen: FakeScreen | undefined,
  kills: 0 | 1,
): Promise<void> {
  const { registry, shell, logged } = current;
  const linesBefore = endLines(logged).length;
  registry.closeAll();

  expect(registry.size).toBe(0);
  expect(shell().stream.destroyed).toBe(true);
  expect(endLines(logged)).toHaveLength(linesBefore);
  expect(shell().terminations).toBe(kills);
  if (screen !== undefined) {
    expect(screen.disposeCalls).toBe(1);
    expect(screen.resetCalls).toBe(0);
  }
  expect(await spy?.seen()).toEqual([]);
}

/** An Error whose name is 80 characters starting with "canary", which the log must never carry. */
function canaryNamedError(): Error {
  const error = new Error("x");
  error.name = "canary".padEnd(80, "x");
  return error;
}

describe("session end paths (U-session-end)", () => {
  it("ends with 4000 and the exit code when the shell exits", async () => {
    const current = await start();
    const client = await current.connect();
    await waitForAttached(client);

    current.shell().exitCode = 3;
    current.shell().peer.end();

    expect(await client.closed).toEqual({ code: 4000, reason: "exit 3" });
    expect(endLines(current.logged)).toEqual([`terminal ${ID} -: ended 4000`]);
    await expectFullyEnded(current, current.screens[0], 1);
  });

  it("ends with `exit unknown` when Docker cannot report the exit code", async () => {
    const current = await start();
    const client = await current.connect();
    await waitForAttached(client);

    current.shell().exitCode = new DockerUnavailableError("inspect exec", "ECONNRESET");
    current.shell().peer.end();

    expect(await client.closed).toEqual({ code: 4000, reason: "exit unknown" });
    await expectFullyEnded(current, current.screens[0], 1);
  });

  it("ends with 4002 when the exec ends after a stop was announced", async () => {
    const current = await start();
    const client = await current.connect();
    await waitForAttached(client);

    current.registry.onStopping(ID);
    current.shell().peer.end();

    expect(await client.closed).toEqual({ code: 4002, reason: "environment stopped" });
    await expectFullyEnded(current, current.screens[0], 0);
  });

  it("ends with 4002 when the container is no longer running", async () => {
    const current = await start();
    const client = await current.connect();
    await waitForAttached(client);
    const info = await current.runtime.inspect(KEY);
    if (info === null) throw new Error("the workspace was not created");

    current.runtime.seed({ ...info, state: "stopped" });
    current.shell().peer.end();

    expect(await client.closed).toEqual({ code: 4002, reason: "environment stopped" });
    await expectFullyEnded(current, current.screens[0], 0);
  });

  it("ends with 1011 when the container inspect at the end rejects", async () => {
    const current = await start();
    const client = await current.connect();
    await waitForAttached(client);

    vi.spyOn(current.runtime, "inspect").mockRejectedValueOnce(
      new DockerUnavailableError("inspect container", "ECONNREFUSED"),
    );
    current.shell().peer.end();

    expect(await client.closed).toEqual({ code: 1011, reason: "terminal error" });
    await expectFullyEnded(current, current.screens[0], 1);
  });

  it("ends every session with 1001 on closeAll", async () => {
    const current = await start();
    const client = await current.connect();
    await waitForAttached(client);

    current.registry.closeAll();

    expect(await client.closed).toEqual({ code: 1001, reason: "service shutting down" });
    await expectFullyEnded(current, current.screens[0], 1);
  });

  it("stops the heartbeat when the session ends, so no interval outlives it", async () => {
    // Only the interval functions are faked: the sockets and the setup keep their real timeouts. The heartbeat is
    // unref'd, so an interval kept past the end would not hang the service; it would leak one per ended session.
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const current = await start({ heartbeatMs: HEARTBEAT_MS });
    const client = await current.connect();
    await waitForAttached(client);
    const server = [...current.app.websocketServer.clients][0];
    if (server === undefined) throw new Error("no server socket");
    const ping = vi.spyOn(server, "ping");
    expect(vi.getTimerCount()).toBe(1);

    current.registry.closeAll();
    vi.advanceTimersByTime(3 * HEARTBEAT_MS);

    expect(vi.getTimerCount()).toBe(0);
    expect(ping).not.toHaveBeenCalled();
    expect(await client.closed).toEqual({ code: 1001, reason: "service shutting down" });
  });

  it.each([
    ["exec create", new DockerApiError("create exec", 409), "DockerApiError"],
    [
      "exec start",
      new DockerResponseShapeError("start exec", "stream"),
      "DockerResponseShapeError",
    ],
    ["exec create with an over-long error name", canaryNamedError(), "Error"],
  ])(
    "closes the socket with 1011 and maps nothing when the %s fails",
    async (_step, error, expected) => {
      const current = await start();
      current.runtime.openShellFailures.push(error);

      const client = await current.connect();

      expect(await client.closed).toEqual({ code: 1011, reason: "terminal error" });
      expect(current.registry.size).toBe(0);
      expect(current.logged).toContain(`terminal ${ID} -: exec failed (${expected})`);
      expect(current.logged.filter((line) => line.includes("canary"))).toEqual([]);
      expect(await spy?.seen()).toEqual([]);
    },
  );

  it("closes a pending socket with the end code, and its later flush callback does nothing", async () => {
    const current = await start({ deferScreen: true });
    const client = await current.connect();
    await vi.waitFor(() => expect(current.screens).toHaveLength(1));

    current.registry.closeAll();
    const closed = await client.closed;
    current.screens[0]?.release();

    expect(closed.code).toBe(1001);
    expect(texts(client)).toEqual([]);
    await expectFullyEnded(current, current.screens[0], 1);
  });

  it("inspects once and ends once when the stream emits end, close and error", async () => {
    const current = await start();
    const client = await current.connect();
    await waitForAttached(client);
    const inspect = vi.spyOn(current.runtime, "inspect");

    const stream = current.shell().stream;
    stream.emit("end");
    stream.emit("close");
    stream.emit("error", new Error("reset"));
    await client.closed;

    expect(inspect).toHaveBeenCalledTimes(1);
    expect(endLines(current.logged)).toHaveLength(1);
    await expectFullyEnded(current, current.screens[0], 1);
  });

  it("survives a headless write still queued when the session ends (real headless)", async () => {
    const current = await start({ realScreen: true });
    const client = await current.connect();
    await waitForAttached(client);

    // Registered after the session's own `data` listener, so the chunk is already queued in xterm.
    current.shell().stream.once("data", () => current.registry.closeAll());
    current.shell().peer.write("queued output\r\n");
    await client.closed;
    await new Promise((resolve) => setTimeout(resolve, 50));

    await expectFullyEnded(current, undefined, 1);
  });

  it("ends with 1011 when a headless write callback body throws (C5)", async () => {
    const current = await start();
    const first = await current.connect();
    await waitForAttached(first);
    await current.leave(first);
    const screen = current.screens[0];
    if (screen === undefined) throw new Error("no screen");

    screen.serializeError = new Error("serialize failed");
    const second = await current.connect();

    expect(await second.closed).toEqual({ code: 1011, reason: "terminal error" });
    await expectFullyEnded(current, screen, 1);
  });

  it("ignores an error emitted on the stream after the end (C9)", async () => {
    const current = await start();
    const client = await current.connect();
    await waitForAttached(client);
    current.registry.closeAll();
    await client.closed;

    current.shell().stream.emit("error", new Error("late"));

    await expectFullyEnded(current, current.screens[0], 1);
  });
});

describe("shell kill (U-kill)", () => {
  it.each([
    ["DockerApiError", new DockerApiError("create exec", 409)],
    ["DockerUnavailableError", new DockerUnavailableError("create exec", "ECONNREFUSED")],
    ["Error", canaryNamedError()],
    ["NonError", "canary"],
  ])("logs a kill rejected with %s once and still ends the session", async (name, error) => {
    const current = await start();
    const client = await current.connect();
    await waitForAttached(client);
    current.shell().terminateFailure = { when: "async", error };

    current.registry.closeAll();

    expect(await client.closed).toEqual({ code: 1001, reason: "service shutting down" });
    // Two macrotask turns: the rejection's handler has run, or Node has reported it as unhandled.
    expect(await spy?.seen()).toEqual([]);
    expect(endLines(current.logged)).toEqual([`terminal ${ID} -: ended 1001`]);
    expect(current.logged.filter((line) => line.includes("kill failed"))).toEqual([
      `terminal ${ID} -: kill failed (${name})`,
    ]);
    expect(current.logged.filter((line) => line.includes("canary"))).toEqual([]);
  });

  it("a kill that throws synchronously still ends the session", async () => {
    const current = await start();
    const client = await current.connect();
    await waitForAttached(client);
    current.shell().terminateFailure = { when: "sync", error: new Error("sync") };

    expect(() => current.registry.closeAll()).not.toThrow();

    expect(await client.closed).toEqual({ code: 1001, reason: "service shutting down" });
    expect(await spy?.seen()).toEqual([]);
    expect(current.logged.filter((line) => line.includes("kill failed"))).toEqual([
      `terminal ${ID} -: kill failed (Error)`,
    ]);
  });
});

describe("resize failures (U-resize-error)", () => {
  it.each([
    ["DockerApiError", new DockerApiError("resize exec", 409)],
    ["DockerUnavailableError", new DockerUnavailableError("resize exec", "ECONNREFUSED")],
    ["NonError", "canary"],
  ])("ignores a resize rejected with %s and logs it once", async (name, error) => {
    const current = await start();
    const client = await current.connect({ conn: "00112233445566ff" });
    await waitForAttached(client);
    current.shell().resizeFailures.push(error);

    client.send({ t: "resize", cols: 120, rows: 40 });
    await vi.waitFor(() => expect(current.shell().resizes).toEqual(["120x40"]));
    current.shell().peer.write("after the resize\r\n");

    await vi.waitFor(() => expect(client.output()).toContain("after the resize"));
    expect(client.ws.readyState).toBe(client.ws.OPEN);
    expect(current.logged.filter((line) => line.includes("resize failed"))).toEqual([
      `terminal ${ID} 00112233445566ff: resize failed (${name})`,
    ]);
    expect(current.screens[0]?.resizes).toEqual(["120x40"]);
    expect(await spy?.seen()).toEqual([]);
  });
});
