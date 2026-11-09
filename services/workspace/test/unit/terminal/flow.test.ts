import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type Frame,
  ID,
  type TerminalSetup,
  terminalSetup,
  waitForAttached,
} from "../../support/terminal.js";

// U-flow (design 3.2.1 rows 14, 20 and the gates, 10.1): output is paused, never dropped, while the browser
// is behind; the gates of a client are cleared when it leaves.

const MIB = 1024 * 1024;
const LOW_WATER = 256 * 1024;
const OVER_HIGH_WATER = MIB + 1;
const CHUNK = 64 * 1024;

let setup: TerminalSetup | undefined;

async function start(options: Parameters<typeof terminalSetup>[0] = {}): Promise<TerminalSetup> {
  setup = await terminalSetup(options);
  return setup;
}

afterEach(async () => {
  await setup?.close();
  setup = undefined;
});

function binaryBytes(frames: readonly Frame[]): number {
  return frames.reduce((sum, frame) => sum + (frame.kind === "binary" ? frame.data.length : 0), 0);
}

describe("flow control (U-flow)", () => {
  it("pauses above 1 MiB unacknowledged and resumes once acks bring it to 256 KiB", async () => {
    const current = await start();
    const client = await current.connect();
    await waitForAttached(client);
    const stream = current.shell().stream;

    current.shell().peer.write(Buffer.alloc(OVER_HIGH_WATER, 0x61));
    await vi.waitFor(() => expect(binaryBytes(client.frames)).toBe(OVER_HIGH_WATER));
    await vi.waitFor(() => expect(stream.isPaused()).toBe(true));
    client.send({ t: "ack", n: OVER_HIGH_WATER - LOW_WATER - 1 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const isPausedAboveLowWater = stream.isPaused();
    client.send({ t: "ack", n: 1 });

    await vi.waitFor(() => expect(stream.isPaused()).toBe(false));
    expect(isPausedAboveLowWater).toBe(true);
  });

  it("pauses while more than 1 MiB is buffered on the socket, even when everything is acknowledged", async () => {
    const current = await start();
    const client = await current.connect();
    await waitForAttached(client);
    const stream = current.shell().stream;
    const server = [...current.app.websocketServer.clients][0];
    if (server === undefined) throw new Error("no server socket");
    const sends = vi.spyOn(server, "send");

    // The browser stops reading but acknowledges every chunk once the service has sent it, so only the
    // socket's own buffer can stop the output.
    client.ws.pause();
    let chunks = 0;
    while (server.bufferedAmount <= MIB) {
      current.shell().peer.write(Buffer.alloc(CHUNK, 0x62));
      chunks += 1;
      await vi.waitFor(() => expect(sends).toHaveBeenCalledTimes(chunks));
      client.send({ t: "ack", n: CHUNK });
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
    const isPausedWhileBuffered = stream.isPaused();
    client.ws.resume();

    await vi.waitFor(() => expect(stream.isPaused()).toBe(false));
    expect(isPausedWhileBuffered).toBe(true);
    expect(client.ws.readyState).toBe(client.ws.OPEN);
  });

  it("closes the client with 1008 when it acknowledges more than it was sent", async () => {
    const current = await start();
    const client = await current.connect();
    await waitForAttached(client);
    current.shell().peer.write("12345");
    await vi.waitFor(() => expect(client.output()).toBe("12345"));

    client.send({ t: "ack", n: 6 });

    expect(await client.closed).toEqual({ code: 1008, reason: "ack exceeds sent" });
  });

  it("pauses while more than 1 MiB waits for the headless parser", async () => {
    const current = await start();
    const client = await current.connect();
    await waitForAttached(client);
    const stream = current.shell().stream;
    const screen = current.screens[0];
    if (screen === undefined) throw new Error("no screen");

    screen.isDeferred = true;
    current.shell().peer.write(Buffer.alloc(OVER_HIGH_WATER, 0x63));
    await vi.waitFor(() => expect(binaryBytes(client.frames)).toBe(OVER_HIGH_WATER));
    client.send({ t: "ack", n: OVER_HIGH_WATER });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const isPausedWhileParsing = stream.isPaused();
    screen.release();

    await vi.waitFor(() => expect(stream.isPaused()).toBe(false));
    expect(isPausedWhileParsing).toBe(true);
  });

  it("resumes at once when a client paused at 1 MiB leaves, so a later exit still ends the session", async () => {
    const current = await start();
    const client = await current.connect();
    await waitForAttached(client);
    const stream = current.shell().stream;
    current.shell().peer.write(Buffer.alloc(OVER_HIGH_WATER, 0x64));
    await vi.waitFor(() => expect(stream.isPaused()).toBe(true));

    await current.leave(client);
    const isPausedAfterLeave = stream.isPaused();
    current.shell().exitCode = 0;
    current.shell().peer.end();

    await vi.waitFor(() => expect(current.registry.size).toBe(0));
    expect(isPausedAfterLeave).toBe(false);
    expect(current.logged).toContain(`terminal ${ID} -: ended 4000`);
  });
});
