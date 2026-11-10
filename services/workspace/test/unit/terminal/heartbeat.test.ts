import { afterEach, describe, expect, it, vi } from "vitest";
import { type TerminalSetup, terminalSetup, waitForAttached } from "../../support/terminal.js";

// U-heartbeat (design 3.2.1 rows 7 and 13, 10.1): a client that leaves a ping unanswered until the next tick
// is terminated, the session stays, and a client attached by takeover never inherits its predecessor's miss.
// Real timers with a short interval; a client stops answering pings by pausing its socket.

const HEARTBEAT_MS = 100;

let setup: TerminalSetup | undefined;

afterEach(async () => {
  await setup?.close();
  setup = undefined;
});

function serverSocketCount(current: TerminalSetup): number {
  return current.app.websocketServer.clients.size;
}

describe("heartbeat (U-heartbeat)", () => {
  it("terminates a client that missed a ping at the next tick and keeps the session", async () => {
    setup = await terminalSetup({ heartbeatMs: HEARTBEAT_MS });
    const current = setup;
    const client = await current.connect();
    await waitForAttached(client);

    client.ws.pause();

    await vi.waitFor(() => expect(serverSocketCount(current)).toBe(0), { timeout: 2_000 });
    expect(current.registry.size).toBe(1);
  });

  it("does not terminate a client attached by takeover right after its predecessor missed a pong", async () => {
    setup = await terminalSetup({ heartbeatMs: HEARTBEAT_MS });
    const current = setup;
    const first = await current.connect();
    await waitForAttached(first);
    const server = [...current.app.websocketServer.clients][0];
    if (server === undefined) throw new Error("no server socket");
    const ping = vi.spyOn(server, "ping");

    first.ws.pause();
    await vi.waitFor(() => expect(ping).toHaveBeenCalled(), { timeout: 2_000 });
    const second = await current.connect();
    await waitForAttached(second);
    await new Promise((resolve) => setTimeout(resolve, 3 * HEARTBEAT_MS));

    expect(second.ws.readyState).toBe(second.ws.OPEN);
    expect(current.registry.size).toBe(1);
  });
});
