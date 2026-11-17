import { afterEach, describe, expect, it, vi } from "vitest";
import { DockerApiError } from "../../../src/errors.js";
import type { FakeShell } from "../../support/fake-runtime.js";
import {
  ID,
  processErrorSpy,
  shellInput,
  type TerminalSetup,
  type TestClient,
  terminalSetup,
  waitForAttached,
} from "../../support/terminal.js";

// U-resize-order (#160): input that follows a resize waits until Docker has applied it, one exec resize is in
// flight per session with the newest size pending, and the wait is bounded by the session's hold timer.

const MINUTE = 60_000;
const IDLE_STOP_MS = 30 * MINUTE;
const CONN = "00112233445566ff";
/** RESIZE_HOLD_MS (2 s) in session.ts plus margin. */
const HOLD_RELEASE_BUDGET_MS = 5_000;
/** The protocol's maximum `d` of one input frame (protocol.ts `MAX_INPUT_UNITS`). */
const FRAME_UNITS = 8192;
const RELEASED_LINE = `terminal ${ID} ${CONN}: resize hold released`;

let setup: TerminalSetup | undefined;
let errorSpy: ReturnType<typeof processErrorSpy> | undefined;

afterEach(async () => {
  errorSpy?.stop();
  errorSpy = undefined;
  await setup?.close();
  setup = undefined;
});

/** An attached client whose shell answers resizes only when the test settles them. */
async function startDeferred(): Promise<{ current: TerminalSetup; client: TestClient }> {
  const current = await terminalSetup();
  setup = current;
  const client = await current.connect({ conn: CONN });
  await waitForAttached(client);
  current.shell().deferResizes = true;
  return { current, client };
}

/** `screenResizes`: how many resizes the screen has after this one; the screen resizes at receipt. */
async function sendResize(
  current: TerminalSetup,
  client: TestClient,
  size: { cols: number; rows: number },
  screenResizes: number,
): Promise<void> {
  client.send({ t: "resize", ...size });
  await vi.waitFor(() => expect(current.screens[0]?.resizes).toHaveLength(screenResizes));
}

/**
 * Touch stays at receipt even for held input, so the moved idle window shows the frame was processed. The clock
 * moves first, because a resize touches too and would satisfy this barrier on its own.
 */
async function sendInput(current: TerminalSetup, client: TestClient, data: string): Promise<void> {
  current.clock.now += MINUTE;
  client.send({ t: "input", d: data });
  await vi.waitFor(() =>
    expect(current.tracker.idleOf(ID)?.stopAt).toBe(current.clock.now + IDLE_STOP_MS),
  );
  await pause(20);
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function heldResize(shell: FakeShell, index: number): FakeShell["heldResizes"][number] {
  const held = shell.heldResizes[index];
  if (held === undefined) throw new Error(`no held resize ${index}`);
  return held;
}

function linesWith(current: TerminalSetup, text: string): string[] {
  return current.logged.filter((line) => line.includes(text));
}

/** Frames of the protocol's maximum size, one per letter, so their order is visible in the shell's input. */
function fullFrames(letters: string): string[] {
  return [...letters].map((letter) => letter.repeat(FRAME_UNITS));
}

function serverSocket(current: TerminalSetup): TestClient["ws"] {
  const server = [...current.app.websocketServer.clients][0];
  if (server === undefined) throw new Error("no server socket");
  return server;
}

describe("resize ordering (U-resize-order)", () => {
  it("holds input that follows a resize until Docker has applied the resize", async () => {
    const { current, client } = await startDeferred();
    const input = shellInput(current.shell());

    await sendResize(current, client, { cols: 120, rows: 40 }, 1);
    await sendInput(current, client, "stty size\r");
    const inputWhileResizing = input();
    heldResize(current.shell(), 0).resolve();

    await vi.waitFor(() => expect(input()).toBe("stty size\r"));
    expect(inputWhileResizing).toBe("");
    expect(current.shell().resizes).toEqual(["120x40"]);
    expect(linesWith(current, "resize hold released")).toEqual([]);
  });

  it("sends one resize at a time and then only the newest pending size", async () => {
    const { current, client } = await startDeferred();

    await sendResize(current, client, { cols: 120, rows: 40 }, 1);
    await sendResize(current, client, { cols: 130, rows: 45 }, 2);
    await sendResize(current, client, { cols: 150, rows: 50 }, 3);
    const sentWhileFirstInFlight = [...current.shell().resizes];
    heldResize(current.shell(), 0).resolve();
    await vi.waitFor(() => expect(current.shell().resizes).toEqual(["120x40", "150x50"]));
    heldResize(current.shell(), 1).resolve();
    await pause(20);

    expect(sentWhileFirstInFlight).toEqual(["120x40"]);
    expect(current.shell().resizes).toEqual(["120x40", "150x50"]);
    expect(current.screens[0]?.resizes).toEqual(["120x40", "130x45", "150x50"]);
  });

  it("logs a rejected resize once and releases the held input", async () => {
    const { current, client } = await startDeferred();
    const input = shellInput(current.shell());

    await sendResize(current, client, { cols: 120, rows: 40 }, 1);
    await sendInput(current, client, "ls\r");
    const inputBeforeReject = input();
    heldResize(current.shell(), 0).reject(new DockerApiError("resize exec", 404));

    await vi.waitFor(() => expect(input()).toBe("ls\r"));
    expect(inputBeforeReject).toBe("");
    expect(linesWith(current, "resize failed")).toEqual([
      `terminal ${ID} ${CONN}: resize failed (DockerApiError)`,
    ]);
  });

  it("releases held input after the hold bound when Docker does not answer, logs it once, and the late answer starts the pending size once", async () => {
    const { current, client } = await startDeferred();
    const input = shellInput(current.shell());

    await sendResize(current, client, { cols: 120, rows: 40 }, 1);
    await sendInput(current, client, "a");
    await sendResize(current, client, { cols: 150, rows: 50 }, 2);
    const inputWhileHeld = input();
    await vi.waitFor(() => expect(input()).toBe("a"), { timeout: HOLD_RELEASE_BUDGET_MS });
    const releaseLines = linesWith(current, "resize hold released");
    await sendInput(current, client, "b");
    const inputAfterRelease = input();
    heldResize(current.shell(), 0).resolve();
    await vi.waitFor(() => expect(current.shell().resizes).toEqual(["120x40", "150x50"]));
    heldResize(current.shell(), 1).resolve();
    await pause(20);

    expect(inputWhileHeld).toBe("");
    expect(releaseLines).toEqual([RELEASED_LINE]);
    expect(inputAfterRelease).toBe("ab");
    expect(current.shell().resizes).toEqual(["120x40", "150x50"]);
    expect(input()).toBe("ab");
    expect(linesWith(current, "resize hold released")).toEqual([RELEASED_LINE]);
  }, 10_000);

  it("writes nothing and starts no pending resize when the session ends during a resize", async () => {
    const { current, client } = await startDeferred();
    errorSpy = processErrorSpy();
    const input = shellInput(current.shell());

    await sendResize(current, client, { cols: 120, rows: 40 }, 1);
    await sendInput(current, client, "x");
    await sendResize(current, client, { cols: 150, rows: 50 }, 2);
    current.registry.closeAll();
    await client.closed;
    heldResize(current.shell(), 0).reject(new DockerApiError("resize exec", 404));
    const processErrors = await errorSpy.seen();

    expect(input()).toBe("");
    expect(current.shell().resizes).toEqual(["120x40"]);
    expect(linesWith(current, "resize failed")).toEqual([
      `terminal ${ID} ${CONN}: resize failed (DockerApiError)`,
    ]);
    expect(processErrors).toEqual([]);
  });

  it("writes input held for a client that was taken over after the resize, before the new client's input", async () => {
    const { current, client: first } = await startDeferred();
    const input = shellInput(current.shell());

    await sendResize(current, first, { cols: 120, rows: 40 }, 1);
    await sendInput(current, first, "old\r");
    const second = await current.connect({ conn: CONN });
    const firstClosed = await first.closed;
    await waitForAttached(second);
    await sendInput(current, second, "new\r");
    const inputWhileHeld = input();
    heldResize(current.shell(), 0).resolve();

    await vi.waitFor(() => expect(input()).toBe("old\rnew\r"));
    expect(firstClosed.code).toBe(4001);
    expect(inputWhileHeld).toBe("");
  });

  it("pauses the sender above 64 Ki held units and keeps it paused until the shell drains the flushed input", async () => {
    // Measured in this package on Node v22.23.1: the default writable high-water mark is 64 KiB
    // (`getDefaultHighWaterMark(false)` = 65536), and nine 8192-char writes into a `duplexPair()` end whose peer
    // is not reading return true seven times, then false, false. So the flush's 8th write pauses for drain, and
    // nine held frames (73 728 units) are above the 65 536-unit hold cap while eight would not be.
    const { current, client } = await startDeferred();
    const server = serverSocket(current);
    const pauseSpy = vi.spyOn(server, "pause");
    const resumeSpy = vi.spyOn(server, "resume");
    const frames = fullFrames("abcdefghi");
    const peer = current.shell().peer;

    await sendResize(current, client, { cols: 120, rows: 40 }, 1);
    for (const data of frames) client.send({ t: "input", d: data });
    await vi.waitFor(() => expect(pauseSpy).toHaveBeenCalled());
    const peerBytesWhileHeld = peer.readableLength;
    const isResumedWhileHeld = resumeSpy.mock.calls.length > 0;
    heldResize(current.shell(), 0).resolve();
    await pause(20);
    const peerBytesAfterFlush = peer.readableLength;
    const isResumedBeforeDrain = resumeSpy.mock.calls.length > 0;
    const input = shellInput(current.shell());

    await vi.waitFor(() => expect(resumeSpy).toHaveBeenCalled());
    expect(peerBytesWhileHeld).toBe(0);
    expect(isResumedWhileHeld).toBe(false);
    expect(peerBytesAfterFlush).toBeGreaterThan(0);
    expect(isResumedBeforeDrain).toBe(false);
    await vi.waitFor(() => expect(input()).toBe(frames.join("")));
  });

  it("keeps a held socket paused when the shell drains during the hold", async () => {
    // Measured as in the test above (Node v22.23.1, 64 KiB writable high-water mark): the eight direct frames fill
    // the stream's buffer exactly and the 8th write returns false, so the socket is paused for drain before the
    // resize, and the drain then comes while the nine later frames are held.
    const { current } = await startDeferred();
    const server = serverSocket(current);
    const pauseSpy = vi.spyOn(server, "pause");
    const resumeSpy = vi.spyOn(server, "resume");
    // Frames ws has already parsed from one chunk: delivered even while the socket is paused.
    const deliver = (message: unknown): void =>
      current.serverListener(0, "message")(Buffer.from(JSON.stringify(message)), false);
    const direct = fullFrames("abcdefgh");
    const held = fullFrames("ijklmnopq");

    for (const data of direct) deliver({ t: "input", d: data });
    await vi.waitFor(() => expect(pauseSpy).toHaveBeenCalled());
    deliver({ t: "resize", cols: 120, rows: 40 });
    await vi.waitFor(() => expect(current.screens[0]?.resizes).toEqual(["120x40"]));
    for (const data of held) deliver({ t: "input", d: data });
    const input = shellInput(current.shell());
    await vi.waitFor(() => expect(input()).toBe(direct.join("")));
    await pause(20);
    const isResumedAfterFirstDrain = resumeSpy.mock.calls.length > 0;
    heldResize(current.shell(), 0).resolve();

    await vi.waitFor(() => expect(input()).toBe([...direct, ...held].join("")));
    await vi.waitFor(() => expect(resumeSpy).toHaveBeenCalled());
    expect(isResumedAfterFirstDrain).toBe(false);
  });
});
