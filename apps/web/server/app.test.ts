// @vitest-environment node
import { EventEmitter } from "node:events";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { Duplex } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { browserHeaders, rawClient } from "@/test/relay-harness";
import {
  attachServerErrorHandler,
  createShutdown,
  createUpgradeDispatch,
  installSignalHandlers,
  SHUTDOWN_HARD_LIMIT_MS,
  TERMINAL_PATH,
} from "./app.ts";
import { serverErrorLine } from "./strings.ts";

// U-dispatch, U-server-error and U-signals (#32 design 3.1, 3.3.1).

const servers: Server[] = [];

afterEach(async () => {
  vi.useRealTimers();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

async function listening(server: Server): Promise<number> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no TCP address");
  return address.port;
}

describe("upgrade dispatch (U-dispatch)", () => {
  async function dispatching() {
    const handled: string[] = [];
    const relay = {
      handle: async (request: IncomingMessage, socket: Duplex) => {
        handled.push(request.url ?? "");
        socket.destroy();
      },
      contain: vi.fn((socket: Duplex, _error: unknown) => socket.destroy()),
    };
    const nextFacing = new EventEmitter();
    const server = createServer();
    server.on("upgrade", createUpgradeDispatch({ relay, nextFacing }));
    const port = await listening(server);
    const headers = browserHeaders({ host: `127.0.0.1:${port}` });
    return { handled, relay, nextFacing, port, headers };
  }

  it("hands the terminal path to the relay", async () => {
    const { handled, port, headers } = await dispatching();

    await rawClient(port, { path: `${TERMINAL_PATH}?ticket=t`, headers }).closed;

    expect(handled).toEqual([`${TERMINAL_PATH}?ticket=t`]);
  });

  it("destroys another path while Next has no upgrade listener", async () => {
    const { handled, port, headers } = await dispatching();

    const client = rawClient(port, { path: "/_next/webpack-hmr", headers });
    await client.closed;

    expect(client.text()).toBe("");
    expect(handled).toEqual([]);
  });

  it("emits another path on Next's server once Next listens there", async () => {
    const { handled, nextFacing, port, headers } = await dispatching();
    const seen: string[] = [];
    nextFacing.on("upgrade", (request: IncomingMessage, socket: Duplex) => {
      seen.push(request.url ?? "");
      socket.destroy();
    });

    await rawClient(port, { path: "/_next/webpack-hmr", headers }).closed;

    expect(seen).toEqual(["/_next/webpack-hmr"]);
    expect(handled).toEqual([]);
  });

  it("contains a malformed URL instead of throwing out of the listener", async () => {
    const { relay, port, headers } = await dispatching();

    await rawClient(port, { path: "//[", headers }).closed;

    expect(relay.contain).toHaveBeenCalledOnce();
    expect(relay.contain.mock.calls[0]?.[1]).toBeInstanceOf(TypeError);
  });
});

describe("server error (U-server-error)", () => {
  it("prints F1b and exits 1 when the server cannot listen", async () => {
    const holder = createServer();
    const port = await listening(holder);
    const server = createServer();
    servers.push(server);
    const logError = vi.fn((_line: string) => {});
    const exit = vi.fn((_code: number) => {});
    attachServerErrorHandler(server, { logError, exit });

    server.listen(port, "127.0.0.1");
    await vi.waitFor(() => expect(exit).toHaveBeenCalled());

    expect(logError.mock.calls).toEqual([[serverErrorLine("Error", "EADDRINUSE")]]);
    expect(exit.mock.calls).toEqual([[1]]);
  });

  it("names a non-Error value NonError", () => {
    const server = new EventEmitter();
    const logError = vi.fn((_line: string) => {});
    attachServerErrorHandler(server, { logError, exit: () => {} });

    server.emit("error", "canary");

    expect(logError.mock.calls).toEqual([["web: server error: NonError (-)"]]);
  });
});

describe("signals (U-signals)", () => {
  function fakeDeps(close: () => Promise<void>) {
    return {
      publicServer: {
        close: vi.fn(),
        closeIdleConnections: vi.fn(),
        closeAllConnections: vi.fn(),
      },
      app: { close: vi.fn(close) },
      relay: { destroyAll: vi.fn() },
      exit: vi.fn((_code: number) => {}),
    };
  }

  it("exits 0 through the hard timer after 8 s when Next's close never resolves", async () => {
    vi.useFakeTimers();
    const deps = fakeDeps(() => new Promise<void>(() => {}));
    const shutdown = createShutdown(deps);

    void shutdown();
    await vi.advanceTimersByTimeAsync(SHUTDOWN_HARD_LIMIT_MS - 1);
    expect(deps.exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(deps.exit.mock.calls).toEqual([[0]]);
    expect(deps.publicServer.closeAllConnections).toHaveBeenCalledOnce();
    expect(deps.relay.destroyAll).toHaveBeenCalledOnce();
  });

  it("closes in order and exits 0 without waiting when everything closes", async () => {
    vi.useFakeTimers();
    const deps = fakeDeps(async () => {});

    await createShutdown(deps)();

    expect(deps.exit.mock.calls).toEqual([[0]]);
    expect(vi.getTimerCount()).toBe(0);
    expect(deps.publicServer.close.mock.invocationCallOrder[0]).toBeLessThan(
      deps.app.close.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("shuts down on SIGTERM and SIGINT, and not at all with NEXT_MANUAL_SIG_HANDLE", () => {
    const target = new EventEmitter();
    const shutdown = vi.fn(async () => {});
    installSignalHandlers(target, {}, shutdown);
    const manual = new EventEmitter();
    installSignalHandlers(manual, { NEXT_MANUAL_SIG_HANDLE: "1" }, shutdown);

    target.emit("SIGTERM");
    target.emit("SIGINT");
    manual.emit("SIGTERM");

    expect(shutdown).toHaveBeenCalledTimes(2);
    expect(manual.listenerCount("SIGTERM")).toBe(0);
  });
});
