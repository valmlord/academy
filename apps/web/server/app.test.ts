// @vitest-environment node
import { EventEmitter } from "node:events";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { Duplex } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  answerAsNext,
  browserHeaders,
  processSpies,
  rawClient,
  settle,
  statusOf,
  within,
} from "@/test/relay-harness";
import {
  attachServerErrorHandler,
  createPublicServer,
  createShutdown,
  createUpgradeDispatch,
  installSignalHandlers,
  nextPrivateOrigin,
  SHUTDOWN_HARD_LIMIT_MS,
  TERMINAL_PATH,
} from "./app.ts";
import { serverErrorLine } from "./strings.ts";

// U-dispatch, U-server-error, U-signals and U-origin (#32 design 3.1, 3.3.1).

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
  type Handle = (request: IncomingMessage, socket: Duplex) => Promise<void>;

  function stubRelay(handle?: Handle) {
    const handled: string[] = [];
    const relay = {
      handle:
        handle ??
        (async (request: IncomingMessage, socket: Duplex) => {
          handled.push(request.url ?? "");
          socket.destroy();
        }),
      contain: vi.fn((socket: Duplex, _error: unknown) => socket.destroy()),
    };
    return { handled, relay };
  }

  /** The production server: upgrade filter, dispatch, and the harness's stand-in for Next. */
  async function dispatching(handle?: Handle) {
    const { handled, relay } = stubRelay(handle);
    const requests: string[] = [];
    const server = createPublicServer();
    server.on("upgrade", createUpgradeDispatch({ relay }));
    server.on("request", answerAsNext(requests));
    const port = await listening(server);
    const headers = browserHeaders({ host: `127.0.0.1:${port}` });
    return { handled, relay, requests, port, headers };
  }

  /** A server without the filter, as on a Node that ignores `shouldUpgradeCallback`. */
  async function unfiltered() {
    const { handled, relay } = stubRelay();
    const server = createServer();
    server.on("upgrade", createUpgradeDispatch({ relay }));
    const port = await listening(server);
    const headers = browserHeaders({ host: `127.0.0.1:${port}` });
    return { handled, relay, port, headers };
  }

  it.each([
    "//api/terminal/socket?ticket=t",
    "/api/terminal/socket/?ticket=t",
    "/api//terminal/socket",
    "/api/terminal/%73ocket",
    "/",
    "/_next/webpack-hmr",
  ])("answers an upgrade on %s as an ordinary request", async (path) => {
    const { handled, requests, port, headers } = await dispatching();
    const client = rawClient(port, { path, headers });

    await within(client.until(/\r\n\r\n/), path);
    client.socket.destroy();

    expect(statusOf(client.text())).toBe("HTTP/1.1 308 Permanent Redirect");
    expect(requests).toEqual([path]);
    expect(handled).toEqual([]);
  });

  it("hands the terminal path to the relay", async () => {
    const { handled, requests, port, headers } = await dispatching();

    await within(rawClient(port, { path: `${TERMINAL_PATH}?ticket=t`, headers }).closed, "close");

    expect(handled).toEqual([`${TERMINAL_PATH}?ticket=t`]);
    expect(requests).toEqual([]);
  });

  it("answers 404 when a non-terminal upgrade reaches the dispatch", async () => {
    const { handled, port, headers } = await unfiltered();
    const client = rawClient(port, { path: "/_next/webpack-hmr", headers });

    await within(client.closed, "close");

    expect(statusOf(client.text())).toBe("HTTP/1.1 404 Not Found");
    expect(handled).toEqual([]);
  });

  it("answers a malformed URL upgrade without anything escaping", async () => {
    const spies = processSpies();
    try {
      const { requests, port, headers } = await dispatching();
      const client = rawClient(port, { path: "//[", headers });

      await within(client.until(/\r\n\r\n/), "//[");
      client.socket.destroy();
      await settle();

      expect(statusOf(client.text())).toBe("HTTP/1.1 308 Permanent Redirect");
      expect(requests).toEqual(["//["]);
      expect(spies.escaped).toEqual([]);
    } finally {
      spies.restore();
    }
  });

  it("answers 404 for a malformed URL that reaches the dispatch", async () => {
    const { relay, port, headers } = await unfiltered();
    const client = rawClient(port, { path: "//[", headers });

    await within(client.closed, "close");

    expect(statusOf(client.text())).toBe("HTTP/1.1 404 Not Found");
    expect(relay.contain).not.toHaveBeenCalled();
  });

  it("contains an error thrown by the relay's handle", async () => {
    const spies = processSpies();
    const canary = new RangeError("canary");
    try {
      const { relay, port, headers } = await dispatching(() => {
        throw canary;
      });

      await within(rawClient(port, { path: `${TERMINAL_PATH}?ticket=t`, headers }).closed, "close");
      await settle();

      expect(relay.contain).toHaveBeenCalledOnce();
      expect(relay.contain.mock.calls[0]?.[1]).toBe(canary);
      expect(spies.escaped).toEqual([]);
    } finally {
      spies.restore();
    }
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

describe("Next's private origin (U-origin)", () => {
  // Next fetches a server action's redirect target from this origin. Node's fetch sends the URL's host as Host,
  // and Better Auth's allowedHosts refuses 0.0.0.0, so the origin must be the one Next's start-server derives.
  it("uses localhost when web listens on every IPv4 address", () => {
    expect(nextPrivateOrigin("0.0.0.0", 3000)).toBe("http://localhost:3000");
  });

  it("uses the IPv6 loopback when web listens on every IPv6 address", () => {
    expect(nextPrivateOrigin("::", 3000)).toBe("http://[::1]:3000");
  });

  it("brackets any other IPv6 address", () => {
    expect(nextPrivateOrigin("::1", 3081)).toBe("http://[::1]:3081");
  });

  it("keeps a named host and the port as given", () => {
    expect(nextPrivateOrigin("localhost", 3081)).toBe("http://localhost:3081");
  });
});
