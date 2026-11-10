import type { EventEmitter } from "node:events";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { isIPv6 } from "node:net";
import path from "node:path";
import type { Duplex } from "node:stream";
import { fileURLToPath } from "node:url";
import { readStandaloneConfig } from "./config-file.ts";
import { type NextApp, type RequestHandler, toNextApp, toNextFactory } from "./next-shape.ts";
import { answer, createRelay, type Relay } from "./relay.ts";
import { serverErrorLine } from "./strings.ts";

// Web's production server (#32 design 3.1, ADR-0011 item 2): Next's request handler behind a listening server
// that accepts only the terminal path as an upgrade (its `shouldUpgradeCallback`) and hands that to the relay.
// Every other upgrade request is handled as a request, which Next answers unless Node refuses it first. Next's
// own upgrade listener sits on a second, never-listening server that nothing emits on: without that server Next
// would attach to the listening one. Run by plain Node from the standalone tree: node:* and `next` only.

export const TERMINAL_PATH = "/api/terminal/socket";
// Next's own start-server uses no hard limit; 8 s stays inside compose's default 10 s stop grace period.
export const SHUTDOWN_HARD_LIMIT_MS = 8_000;

const ERROR_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const SYSTEM_CODE = /^[A-Z][A-Z0-9_]{0,31}$/;

/** Whether `request` asks for the terminal path: its parsed pathname, exactly. Never throws. */
export function isTerminalUpgrade(request: IncomingMessage): boolean {
  return URL.parse(request.url ?? "/", "http://localhost")?.pathname === TERMINAL_PATH;
}

/**
 * The listening server. Next's production upgrade handler leaves an upgrade with no matched output open on
 * purpose (`router-server.js:801-802`), every `//` and trailing-slash path included, so no upgrade other than the
 * terminal path may reach it: Node handles those as requests instead.
 */
export function createPublicServer(): Server {
  return createServer({
    shouldUpgradeCallback: (request) => {
      try {
        return isTerminalUpgrade(request);
      } catch {
        // Node calls this from its HTTP parser, outside every listener's catch: a throw is an uncaughtException.
        return false;
      }
    },
  });
}

export interface DispatchDeps {
  relay: Pick<Relay, "handle" | "contain">;
}

/**
 * The public server's `upgrade` listener, contained as 3.3.1 R1/R2. Only terminal-path upgrades reach it; anything
 * else is answered 404.
 */
export function createUpgradeDispatch(
  deps: DispatchDeps,
): (request: IncomingMessage, socket: Duplex, head: Buffer) => void {
  return (request, socket, head) => {
    // R1, first: Node removed its own socket error handler before emitting `upgrade`.
    socket.on("error", () => socket.destroy());
    try {
      if (!isTerminalUpgrade(request)) {
        answer(socket, 404);
        return;
      }
      deps.relay
        .handle(request, socket, head)
        .catch((error: unknown) => deps.relay.contain(socket, error));
    } catch (error: unknown) {
      deps.relay.contain(socket, error);
    }
  };
}

export interface ExitDeps {
  logError: (line: string) => void;
  exit: (code: number) => void;
}

/** R7: a server error (EADDRINUSE at listen, EMFILE later) prints F1b and exits 1, as Next's start-server. */
export function attachServerErrorHandler(server: EventEmitter, deps: ExitDeps): void {
  server.on("error", (error: unknown) => {
    const name = error instanceof Error && ERROR_NAME.test(error.name) ? error.name : "NonError";
    const code: unknown = error instanceof Error ? Reflect.get(error, "code") : undefined;
    deps.logError(
      serverErrorLine(name, typeof code === "string" && SYSTEM_CODE.test(code) ? code : undefined),
    );
    deps.exit(1);
  });
}

/** R5: a rejected Next handler answers 500, or destroys a response that has already started. */
export function createRequestListener(
  handler: RequestHandler,
): (request: IncomingMessage, response: ServerResponse) => void {
  return (request, response) => {
    handler(request, response).catch(() => {
      if (!response.headersSent) {
        response.statusCode = 500;
        response.end("Internal Server Error");
      } else {
        response.destroy();
      }
    });
  };
}

/**
 * The origin Next's start-server stores in `__NEXT_PRIVATE_ORIGIN` for a server listening on `hostname`
 * (`start-server.js:262-280`): every-address hosts become their loopback, any other IPv6 address is bracketed.
 */
export function nextPrivateOrigin(hostname: string, port: number): string {
  let host: string;
  if (hostname === "" || hostname === "0.0.0.0") host = "localhost";
  else if (hostname === "::") host = "[::1]";
  else host = isIPv6(hostname) ? `[${hostname}]` : hostname;
  return `http://${host}:${port}`;
}

export interface ShutdownDeps {
  publicServer: Pick<Server, "close" | "closeIdleConnections" | "closeAllConnections">;
  app: Pick<NextApp, "close">;
  relay: Pick<Relay, "destroyAll">;
  exit: (code: number) => void;
}

/** SIGTERM / SIGINT: close everything in order, and exit after 8 s whatever is still hanging. */
export function createShutdown(deps: ShutdownDeps): () => Promise<void> {
  let isShuttingDown = false;
  return async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    const hardTimer = setTimeout(() => {
      try {
        deps.publicServer.closeAllConnections();
      } catch {
        // R3: the exit below is the point of this timer.
      }
      deps.exit(0);
    }, SHUTDOWN_HARD_LIMIT_MS);
    try {
      deps.publicServer.close();
      deps.publicServer.closeIdleConnections();
      deps.relay.destroyAll();
      await deps.app.close();
      deps.publicServer.closeAllConnections();
    } catch {
      // A failed close still ends in exit(0): the process is going away either way.
    }
    clearTimeout(hardTimer);
    deps.exit(0);
  };
}

/** As Next's start-server: no handlers when NEXT_MANUAL_SIG_HANDLE is set. */
export function installSignalHandlers(
  target: Pick<EventEmitter, "on">,
  env: { NEXT_MANUAL_SIG_HANDLE?: string | undefined },
  shutdown: () => Promise<void>,
): void {
  if (env.NEXT_MANUAL_SIG_HANDLE) return;
  for (const signal of ["SIGTERM", "SIGINT"]) {
    target.on(signal, () => {
      void shutdown();
    });
  }
}

/** Starts web: the config of the build, Next, the relay, the listening server (design 3.1 steps 1-4). */
export async function start(): Promise<void> {
  // The parent of this file's directory: /app/apps/web in the image, where .next and public live.
  const dir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  process.chdir(dir);
  // Next's generated server.js does the same; Reflect.set because Next's types declare NODE_ENV read-only.
  Reflect.set(process.env, "NODE_ENV", "production");
  process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = await readStandaloneConfig(dir);
  const port = Number.parseInt(process.env.PORT ?? "", 10) || 3000;
  const hostname = process.env.HOSTNAME || "0.0.0.0";
  // Next's start-server sets this and the next() API does not. A server action's redirect fetches its target
  // page from this origin; without it Next uses http://<HOSTNAME>:<PORT> (0.0.0.0:3000 in the image), Node's
  // fetch sends that as Host, Better Auth's allowedHosts refuses it, and the sign-out redirect's sign-in page
  // fails with SessionReadError.
  process.env.__NEXT_PRIVATE_ORIGIN = nextPrivateOrigin(hostname, port);

  const publicServer = createPublicServer();
  const keepAliveTimeout = Number.parseInt(process.env.KEEP_ALIVE_TIMEOUT ?? "", 10);
  if (Number.isFinite(keepAliveTimeout) && keepAliveTimeout >= 0) {
    publicServer.keepAliveTimeout = keepAliveTimeout;
  }
  const exitDeps: ExitDeps = {
    logError: (line) => console.error(line),
    exit: (code) => process.exit(code),
  };
  attachServerErrorHandler(publicServer, exitDeps);
  const nextFacing = createServer();

  // Required only now: the no-config failure above needs no node_modules (R-SMOKE).
  const loaded: unknown = createRequire(import.meta.url)("next");
  const app = toNextApp(
    toNextFactory(loaded)({ dev: false, dir, hostname, port, httpServer: nextFacing }),
  );
  await app.prepare();
  publicServer.on("request", createRequestListener(app.getRequestHandler()));

  const relay = createRelay({
    env: {
      WORKSPACE_SERVICE_URL: process.env.WORKSPACE_SERVICE_URL,
      WORKSPACE_SERVICE_SECRET: process.env.WORKSPACE_SERVICE_SECRET,
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
      TERMINAL_RELAY_MAX_SECONDS: process.env.TERMINAL_RELAY_MAX_SECONDS,
    },
  });
  publicServer.on("upgrade", createUpgradeDispatch({ relay }));
  installSignalHandlers(
    process,
    { NEXT_MANUAL_SIG_HANDLE: process.env.NEXT_MANUAL_SIG_HANDLE },
    createShutdown({ publicServer, app, relay, exit: exitDeps.exit }),
  );
  await new Promise<void>((resolve) => publicServer.listen(port, hostname, resolve));
}
