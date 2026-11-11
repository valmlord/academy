import { afterEach, describe, expect, it, vi } from "vitest";
import { DockerUnavailableError } from "../../../src/errors.js";
import {
  ID,
  processErrorSpy,
  shellInput,
  type TerminalSetup,
  terminalSetup,
  texts,
  waitForAttached,
} from "../../support/terminal.js";

// The attach rows of design 3.2.1 (rows 1-12, 17-19) over real `ws` sockets and the in-memory runtime:
// U-registry, U-registry-race, U-attach-flush, U-stale-close, U-pending-invalid and U-connect-error (10.1).

let setup: TerminalSetup | undefined;

async function start(options: Parameters<typeof terminalSetup>[0] = {}): Promise<TerminalSetup> {
  setup = await terminalSetup(options);
  return setup;
}

afterEach(async () => {
  await setup?.close();
  setup = undefined;
});

describe("terminal registry (U-registry)", () => {
  it("creates one session, and a second connection takes it over with a snapshot", async () => {
    const { connect, shell, runtime, registry } = await start();
    const first = await connect();
    await waitForAttached(first);
    shell().peer.write("hello from the shell\r\n");
    await vi.waitFor(() => expect(first.output()).toContain("hello from the shell"));

    const second = await connect();
    const closedFirst = await first.closed;
    await vi.waitFor(() => expect(texts(second)).toHaveLength(2));

    expect(texts(first)[0]).toEqual({ t: "attached", resumed: false });
    expect(closedFirst).toEqual({ code: 4001, reason: "taken over" });
    expect(texts(second)[0]).toEqual({ t: "attached", resumed: true });
    expect(texts(second)[1]).toEqual({ t: "snapshot", d: "hello from the shell\r\n" });
    expect(runtime.shells).toHaveLength(1);
    expect(registry.size).toBe(1);
    expect(shell().terminations).toBe(0);
  });

  it("keeps the session when the client closes, and the next connection resumes it", async () => {
    const { connect, leave, shell, runtime, registry } = await start();
    const first = await connect();
    await waitForAttached(first);

    await leave(first);
    const second = await connect();
    await waitForAttached(second);

    expect(registry.size).toBe(1);
    expect(runtime.shells).toHaveLength(1);
    expect(texts(second)[0]).toEqual({ t: "attached", resumed: true });
    expect(shell().terminations).toBe(0);
  });

  it("refuses a connection with 4002 when the workspace is not running", async () => {
    const { connect, manager, runtime, registry } = await start();
    await manager.stop({ userId: "user-1", courseId: "course-a", lessonId: "with-workspace" });

    const client = await connect();
    const closed = await client.closed;

    expect(closed).toEqual({ code: 4002, reason: "environment stopped" });
    expect(runtime.shells).toHaveLength(0);
    expect(registry.size).toBe(0);
  });
});

describe("attach races (U-registry-race)", () => {
  it("creates one shell and attaches only the newest of three connections that arrive together", async () => {
    const { connect, screens, runtime } = await start({ deferScreen: true });

    const [first, second, third] = await Promise.all([connect(), connect(), connect()]);
    await vi.waitFor(() => expect(screens[0]?.queued).toBe(3));
    screens[0]?.release();
    const [closedFirst, closedSecond] = await Promise.all([first.closed, second.closed]);
    await waitForAttached(third);

    expect(closedFirst).toEqual({ code: 4001, reason: "taken over" });
    expect(closedSecond).toEqual({ code: 4001, reason: "taken over" });
    expect(texts(first)).toEqual([]);
    expect(texts(second)).toEqual([]);
    expect(texts(third)[0]).toEqual({ t: "attached", resumed: true });
    expect(runtime.shells).toHaveLength(1);
    expect(screens).toHaveLength(1);
  });
});

describe("attach flush (U-attach-flush)", () => {
  it("delivers output that is not parsed yet at the attach exactly once, in the snapshot or live", async () => {
    const { connect, leave, shell, screens } = await start({ deferScreen: true });
    const first = await connect();
    await vi.waitFor(() => expect(screens).toHaveLength(1));
    const screen = screens[0];
    if (screen === undefined) throw new Error("no screen");
    screen.release();
    await waitForAttached(first);
    await leave(first);

    shell().peer.write("marker-a\r\n");
    await vi.waitFor(() => expect(screen.queued).toBe(1));
    const second = await connect();
    await vi.waitFor(() => expect(screen.queued).toBe(2));
    screen.release();
    await waitForAttached(second);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const seen = `${JSON.stringify(texts(second)[1])}${second.output()}`;

    expect(seen.split("marker-a")).toHaveLength(2);
  });
});

describe("stale sockets (U-stale-close)", () => {
  it("ignores the replaced client's late close and input", async () => {
    const { connect, shell, serverListener } = await start();
    const first = await connect();
    await waitForAttached(first);
    const input = shellInput(shell());
    const second = await connect();
    await waitForAttached(second);
    await first.closed;

    serverListener(0, "message")(Buffer.from('{"t":"input","d":"from-first"}'), false);
    serverListener(0, "close")(1000, Buffer.from(""));
    shell().peer.write("still-attached\r\n");
    second.send({ t: "input", d: "from-second" });

    await vi.waitFor(() => expect(second.output()).toContain("still-attached"));
    await vi.waitFor(() => expect(input()).toContain("from-second"));
    expect(input()).not.toContain("from-first");
  });
});

describe("invalid messages (U-pending-invalid)", () => {
  it("ignores invalid JSON and binary frames from the pending socket", async () => {
    const { connect, screens } = await start({ deferScreen: true });
    const client = await connect();
    await vi.waitFor(() => expect(screens).toHaveLength(1));

    client.ws.send("not json");
    client.ws.send(Buffer.from([1, 2, 3]));
    await new Promise((resolve) => setTimeout(resolve, 20));
    screens[0]?.release();
    await waitForAttached(client);

    expect(client.ws.readyState).toBe(client.ws.OPEN);
  });

  it("closes the client with 1008 on invalid JSON", async () => {
    const { connect, shell } = await start();
    const client = await connect();
    await waitForAttached(client);

    client.ws.send("not json");

    expect(await client.closed).toEqual({ code: 1008, reason: "invalid message" });
    expect(shell().terminations).toBe(0);
  });

  it("closes the client with 1003 on a binary frame", async () => {
    const { connect } = await start();
    const client = await connect();
    await waitForAttached(client);

    client.ws.send(Buffer.from([1, 2, 3]));

    expect((await client.closed).code).toBe(1003);
  });
});

describe("connect failures (U-connect-error)", () => {
  it("closes the socket with 1011 and releases the exec when the session cannot be built", async () => {
    const { connect, runtime, registry } = await start({ screenError: new Error("no screen") });
    const spy = processErrorSpy();

    const client = await connect();
    const closed = await client.closed;
    const seen = await spy.seen();
    spy.stop();

    expect(closed).toEqual({ code: 1011, reason: "terminal error" });
    expect(registry.size).toBe(0);
    expect(runtime.shells[0]?.stream.destroyed).toBe(true);
    expect(runtime.shells[0]?.terminations).toBe(1);
    expect(seen).toEqual([]);
  });

  it("closes the socket with 1011 when the container inspect rejects", async () => {
    const { connect, runtime, registry, logged } = await start();
    const spy = processErrorSpy();
    vi.spyOn(runtime, "inspect").mockRejectedValueOnce(
      new DockerUnavailableError("inspect container", "ECONNREFUSED"),
    );

    const client = await connect({ conn: "0123456789abcdef" });
    const closed = await client.closed;
    const seen = await spy.seen();
    spy.stop();

    expect(closed).toEqual({ code: 1011, reason: "terminal error" });
    expect(registry.size).toBe(0);
    expect(logged).toContain(
      `terminal ${ID} 0123456789abcdef: exec failed (DockerUnavailableError)`,
    );
    expect(seen).toEqual([]);
  });
});
