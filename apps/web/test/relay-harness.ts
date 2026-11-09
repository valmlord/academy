import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { connect, Socket } from "node:net";
import type { Duplex } from "node:stream";
import { createPublicServer, createUpgradeDispatch } from "@/server/app";
import { createRelay, type Relay, type RelayOptions } from "@/server/relay";
import { deriveTicketKey, mintTicket } from "@/server/ticket";

// Real sockets for the relay's unit tests (#32 design 10.3 U-relay*): a fake workspace service that records
// what reaches it, web's upgrade dispatch with the real relay, with the production server's upgrade filter and a
// stand-in for Next's request handler, and a raw client that writes the bytes a browser (or an attacker) would.

export const AUTH_SECRET = "canary-relay-auth-secret".padEnd(40, "x");
export const SERVICE_SECRET = "canary-relay-service-secret".padEnd(40, "y");
export const TICKET_KEY = deriveTicketKey(AUTH_SECRET);
export const CLIENT_KEY = "dGhlIHNhbXBsZSBub25jZQ==";
const WEBSOCKET_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

export interface UpstreamRecord {
  url: string | undefined;
  headerNames: string[];
  headers: IncomingMessage["headers"];
  received: Buffer[];
}

export type UpstreamBehaviour = "accept" | "conflict" | "silent" | "reset-after-101";

export interface Upstream {
  url: string;
  records: UpstreamRecord[];
  /** The service side of every upgraded or pending socket, to watch it close. */
  sockets: Duplex[];
  /** How the next upgrades are answered. */
  setBehaviour(next: UpstreamBehaviour): void;
  close(): Promise<void>;
}

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") reject(new Error("no TCP address"));
      else resolve(address.port);
    });
  });
}

function closeServer(server: Server): Promise<void> {
  server.closeAllConnections();
  return new Promise((resolve) => server.close(() => resolve()));
}

export async function startUpstream(initial: UpstreamBehaviour = "accept"): Promise<Upstream> {
  let behaviour = initial;
  const records: UpstreamRecord[] = [];
  const sockets: Duplex[] = [];
  const server = createServer();
  server.on("upgrade", (request: IncomingMessage, socket: Duplex) => {
    const record: UpstreamRecord = {
      url: request.url,
      headerNames: request.rawHeaders
        .filter((_, i) => i % 2 === 0)
        .map((name) => name.toLowerCase()),
      headers: request.headers,
      received: [],
    };
    records.push(record);
    sockets.push(socket);
    socket.on("error", () => socket.destroy());
    // http.Server sockets allow half-open: without this, the relay's end would leave this side open.
    socket.on("end", () => socket.destroy());
    if (behaviour === "silent") return;
    if (behaviour === "conflict") {
      socket.end("HTTP/1.1 409 Conflict\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}");
      return;
    }
    const key = String(request.headers["sec-websocket-key"]);
    const accept = createHash("sha1").update(`${key}${WEBSOCKET_GUID}`).digest("base64");
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    if (behaviour === "reset-after-101") {
      setImmediate(() => {
        if (socket instanceof Socket) socket.resetAndDestroy();
        else socket.destroy();
      });
      return;
    }
    socket.on("data", (chunk: Buffer) => {
      record.received.push(chunk);
      socket.write(Buffer.concat([Buffer.from("echo:"), chunk]));
    });
  });
  const port = await listen(server);
  return {
    url: `http://127.0.0.1:${port}`,
    records,
    sockets,
    setBehaviour: (next) => {
      behaviour = next;
    },
    // Upgraded sockets leave the server's connection tracking, so closeAllConnections misses them.
    close: () => {
      for (const socket of sockets) socket.destroy();
      return closeServer(server);
    },
  };
}

export interface Web {
  port: number;
  host: string;
  relay: Relay;
  lines: string[];
  /** The URL of every request the stand-in for Next answered. */
  requests: string[];
  close(): Promise<void>;
}

/**
 * Stands in for Next's request handler: records the URL and answers 308 to `/`. 308 is distinguishable from the
 * dispatch's 404; like Next it sends no `Connection: close`, so the connection stays open after the answer.
 */
export function answerAsNext(
  requests: string[],
): (request: IncomingMessage, response: ServerResponse) => void {
  return (request, response) => {
    requests.push(request.url ?? "");
    response.writeHead(308, { Location: "/" });
    response.end();
  };
}

/** Rejects with `label` when `promise` has not settled within `ms`, so a held socket fails with a message. */
export function within<T>(promise: Promise<T>, label: string, ms = 2_000): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer within ${ms} ms: ${label}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function startWeb(
  options: Partial<RelayOptions> & { serviceUrl?: string },
): Promise<Web> {
  const lines: string[] = [];
  const relay = createRelay({
    log: (line) => lines.push(line),
    ...options,
    env: options.env ?? {
      WORKSPACE_SERVICE_URL: options.serviceUrl,
      WORKSPACE_SERVICE_SECRET: SERVICE_SECRET,
      BETTER_AUTH_SECRET: AUTH_SECRET,
    },
  });
  const requests: string[] = [];
  const server = createPublicServer();
  server.on("upgrade", createUpgradeDispatch({ relay }));
  server.on("request", answerAsNext(requests));
  const port = await listen(server);
  return {
    port,
    host: `127.0.0.1:${port}`,
    relay,
    lines,
    requests,
    close: () => closeServer(server),
  };
}

export function ticketFor(
  now: number,
  change: Partial<{ u: string; c: string; l: string; dl: number }> = {},
  key: Buffer = TICKET_KEY,
): string {
  return mintTicket(
    key,
    { u: "user_a", c: "agentic-dev", l: "first-lesson", dl: now + 900_000, ...change },
    now,
  );
}

export interface RawUpgrade {
  path: string;
  method?: string;
  headers?: Record<string, string | undefined>;
}

/** The headers a same-origin browser sends; `undefined` in `headers` drops one. */
export function browserHeaders(
  web: Pick<Web, "host">,
  extra: Record<string, string | undefined> = {},
) {
  return {
    Host: web.host,
    Origin: `http://${web.host}`,
    Connection: "Upgrade",
    Upgrade: "websocket",
    "Sec-WebSocket-Version": "13",
    "Sec-WebSocket-Key": CLIENT_KEY,
    ...extra,
  };
}

export interface Client {
  socket: Socket;
  /** Everything received so far, as latin1 text. */
  text(): string;
  /** Resolves once the received text matches. */
  until(pattern: RegExp): Promise<string>;
  closed: Promise<void>;
}

export function rawClient(port: number, request: RawUpgrade): Client {
  const socket = connect(port, "127.0.0.1");
  const chunks: Buffer[] = [];
  const waiters: (() => void)[] = [];
  socket.on("error", () => {});
  socket.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
    for (const wake of waiters.splice(0)) wake();
  });
  const closed = new Promise<void>((resolve) => socket.on("close", () => resolve()));
  const lines = [`${request.method ?? "GET"} ${request.path} HTTP/1.1`];
  for (const [name, value] of Object.entries(request.headers ?? {})) {
    if (value !== undefined) lines.push(`${name}: ${value}`);
  }
  socket.write(`${lines.join("\r\n")}\r\n\r\n`, "latin1");
  const text = () => Buffer.concat(chunks).toString("latin1");
  return {
    socket,
    text,
    closed,
    until(pattern) {
      return new Promise((resolve, reject) => {
        const check = () => {
          if (pattern.test(text())) resolve(text());
          else if (socket.destroyed)
            reject(new Error(`closed before ${pattern}: ${JSON.stringify(text())}`));
          else waiters.push(check);
        };
        socket.once("close", () => {
          for (const wake of waiters.splice(0)) wake();
        });
        check();
      });
    },
  };
}

export function statusOf(text: string): string {
  return text.split("\r\n", 1)[0] ?? "";
}

/** Spies on the process events that would mean an error escaped containment (R6). */
export function processSpies() {
  const escaped: string[] = [];
  const onException = (error: unknown) => escaped.push(`uncaughtException ${String(error)}`);
  const onRejection = (reason: unknown) => escaped.push(`unhandledRejection ${String(reason)}`);
  process.on("uncaughtException", onException);
  process.on("unhandledRejection", onRejection);
  return {
    escaped,
    restore() {
      process.off("uncaughtException", onException);
      process.off("unhandledRejection", onRejection);
    },
  };
}

/** Two macrotask turns: a rejection is reported after the microtask queue drains. */
export async function settle(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}
