import { randomBytes } from "node:crypto";
import {
  type ClientRequest,
  request as httpRequest,
  type IncomingMessage,
  STATUS_CODES,
} from "node:http";
import { Socket } from "node:net";
import type { Duplex } from "node:stream";
import {
  containedLine,
  cutAtDeadlineLine,
  type LimitedReason,
  type RefusalReason,
  refusedLine,
  suppressedLine,
  upstreamFailedLine,
} from "./strings.ts";
import { createTicketVerifier, lazyTicketKey, type TicketPayload } from "./ticket.ts";

// The terminal relay (#32 design 3.3 item 3, 3.3.1, ADR-0011 item 3): checks the browser's upgrade, then pipes
// it byte for byte to the workspace service's terminal route and cuts it at the ticket's deadline. Nothing here
// may throw out of a listener or timer: Next's process-wide handlers would log the error in full (an
// ERR_INVALID_URL carries the ticket URL) and the socket would leak. Logs carry a reason code, a status or a
// system error code and the connection id, never an error object, a message, a header or a URL.

export interface RelayEnv {
  WORKSPACE_SERVICE_URL?: string | undefined;
  WORKSPACE_SERVICE_SECRET?: string | undefined;
  BETTER_AUTH_SECRET?: string | undefined;
  TERMINAL_RELAY_MAX_SECONDS?: string | undefined;
}

export type SetTimer = (callback: () => void, ms: number) => unknown;

export interface RelayOptions {
  env: RelayEnv;
  connectTimeoutMs?: number;
  /** Defaults to TERMINAL_RELAY_MAX_SECONDS of `env`. */
  capSeconds?: number;
  now?: () => number;
  /** The log limiter's timer; the default is an unref'd setTimeout, so it never holds the process open. */
  setTimer?: SetTimer;
  log?: (line: string) => void;
}

export interface Relay {
  handle(request: IncomingMessage, socket: Duplex, head: Buffer): Promise<void>;
  /** The backstop for anything that escaped: 400 if nothing was answered yet, destroy, F4d. Never throws. */
  contain(socket: Duplex, error: unknown): void;
  /** Ends every live pair (SIGTERM). */
  destroyAll(): void;
}

const CONNECT_TIMEOUT_MS = 10_000;
const CAP_SECONDS = { min: 120, max: 3600, fallback: 900 };
const KEEP_ALIVE_MS = 30_000;
const LOG_WINDOW_MS = 10_000;

const WEBSOCKET_KEY = /^[A-Za-z0-9+/]{22}==$/;
const WEBSOCKET_ACCEPT = /^[A-Za-z0-9+/]{27}=$/;
// Loopback only (ADR-0008 item 6's host rule): a page on another host cannot be the terminal's origin.
const LOOPBACK_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?$/;
const ERROR_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const SYSTEM_CODE = /^[A-Z][A-Z0-9_]{0,31}$/;

function capSecondsOf(env: RelayEnv): number {
  const raw = env.TERMINAL_RELAY_MAX_SECONDS;
  const value = raw !== undefined && /^[0-9]{1,6}$/.test(raw) ? Number(raw) : Number.NaN;
  // Web's startup check refuses any other value (lib/workspace/env.ts), so the fallback covers only "unset".
  return value >= CAP_SECONDS.min && value <= CAP_SECONDS.max ? value : CAP_SECONDS.fallback;
}

function errorNameOf(error: unknown): string {
  if (!(error instanceof Error)) return "NonError";
  return ERROR_NAME.test(error.name) ? error.name : "Error";
}

function systemCodeOf(error: unknown): string {
  const code: unknown = error instanceof Error ? Reflect.get(error, "code") : undefined;
  return typeof code === "string" && SYSTEM_CODE.test(code) ? code : errorNameOf(error);
}

function headerOf(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  return typeof value === "string" ? value : undefined;
}

/** A bare status line and `Connection: close`, then the socket is destroyed once it is flushed. */
function answer(socket: Duplex, status: number): void {
  if (!socket.writable) {
    socket.destroy();
    return;
  }
  socket.end(`HTTP/1.1 ${status} ${STATUS_CODES[status] ?? ""}\r\nConnection: close\r\n\r\n`, () =>
    socket.destroy(),
  );
}

interface LimiterEntry {
  windowStart: number;
  suppressed: number;
  isTimerArmed: boolean;
  reason: LimitedReason;
}

/**
 * Per key, the first line of a 10 s window is printed and later ones are counted; a timer armed at the first
 * suppression prints F4e at the end of the window, whether or not another line comes (S4-N2).
 */
class LogLimiter {
  readonly #entries = new Map<string, LimiterEntry>();
  readonly #now: () => number;
  readonly #setTimer: SetTimer;
  readonly #log: (line: string) => void;

  constructor(now: () => number, setTimer: SetTimer, log: (line: string) => void) {
    this.#now = now;
    this.#setTimer = setTimer;
    this.#log = log;
  }

  line(key: string, reason: LimitedReason, text: string): void {
    const now = this.#now();
    const entry = this.#entries.get(key);
    if (entry !== undefined && now < entry.windowStart + LOG_WINDOW_MS) {
      entry.suppressed += 1;
      if (!entry.isTimerArmed) {
        entry.isTimerArmed = true;
        this.#setTimer(() => this.#flush(key, entry), entry.windowStart + LOG_WINDOW_MS - now);
      }
      return;
    }
    // A window whose timer has not fired yet (a late timer) is closed here; the timer then finds a newer entry.
    if (entry !== undefined) this.#flush(key, entry);
    this.#entries.set(key, { windowStart: now, suppressed: 0, isTimerArmed: false, reason });
    this.#log(text);
  }

  #flush(key: string, entry: LimiterEntry): void {
    try {
      if (this.#entries.get(key) !== entry) return;
      this.#entries.delete(key);
      if (entry.suppressed > 0) this.#log(suppressedLine(entry.suppressed, entry.reason));
    } catch {
      // R3: a timer body never throws; a failed log line is all that is lost.
    }
  }
}

/** What the checks let through to the upstream request. */
interface Accepted {
  payload: TicketPayload;
  serviceUrl: string;
  secret: string;
  websocketKey: string;
}

interface UpgradeState {
  conn: string;
  /** A status line (refusal, 101 or 502) was written: contain() must not write a second one. */
  hasAnswered: boolean;
  pair: RelayPair | undefined;
}

/**
 * One browser socket and its upstream request, later its upstream socket. `destroy()` is idempotent and is
 * called by every end: either socket's close or error, a non-101, the connect timeout, the deadline, SIGTERM
 * and contain(). It keeps every `error` listener: `request.destroy()` before a response emits ECONNRESET
 * later, from the client socket's close path.
 */
class RelayPair {
  readonly #client: Socket;
  readonly #request: ClientRequest;
  readonly #live: Set<RelayPair>;
  #upstream: Socket | undefined;
  #connectTimer: NodeJS.Timeout | undefined;
  #deadlineTimer: NodeJS.Timeout | undefined;
  #isDestroyed = false;
  readonly #onClose = (): void => this.destroy();

  constructor(client: Socket, request: ClientRequest, live: Set<RelayPair>) {
    this.#client = client;
    this.#request = request;
    this.#live = live;
    live.add(this);
    client.on("close", this.#onClose);
    client.on("error", this.#onClose);
  }

  get isDestroyed(): boolean {
    return this.#isDestroyed;
  }

  armConnectTimer(ms: number, onTimeout: () => void): void {
    this.#connectTimer = setTimeout(() => this.#endFromTimer(onTimeout), ms);
  }

  clearConnectTimer(): void {
    clearTimeout(this.#connectTimer);
    this.#connectTimer = undefined;
  }

  /** At the 101: the upstream socket joins the pair; `error` first, before any write. */
  adoptUpstream(upstream: Socket): void {
    this.#upstream = upstream;
    upstream.on("error", this.#onClose);
    upstream.on("close", this.#onClose);
  }

  armDeadline(ms: number, onDeadline: () => void): void {
    this.#deadlineTimer = setTimeout(() => this.#endFromTimer(onDeadline), ms);
  }

  // R3: a timer body never throws out of the timer; the pair is released whatever the log line did.
  #endFromTimer(before: () => void): void {
    try {
      before();
    } catch {
      // Only a log line can fail here.
    }
    try {
      this.destroy();
    } catch {
      // destroy() releases sockets and timers only; nothing is left to do.
    }
  }

  destroy(): void {
    if (this.#isDestroyed) return;
    this.#isDestroyed = true;
    clearTimeout(this.#connectTimer);
    clearTimeout(this.#deadlineTimer);
    this.#live.delete(this);
    this.#request.removeAllListeners("response");
    this.#request.removeAllListeners("upgrade");
    this.#client.removeListener("close", this.#onClose);
    this.#upstream?.removeListener("close", this.#onClose);
    this.#request.destroy();
    this.#upstream?.destroy();
    // A status line being flushed by answer() destroys the socket itself once written.
    if (!this.#client.writableEnded) this.#client.destroy();
  }
}

function randomConnectionId(): string {
  return randomBytes(8).toString("hex");
}

export function createRelay(options: RelayOptions): Relay {
  const env = options.env;
  const connectTimeoutMs = options.connectTimeoutMs ?? CONNECT_TIMEOUT_MS;
  const capSeconds = options.capSeconds ?? capSecondsOf(env);
  const now = options.now ?? (() => Date.now());
  const log = options.log ?? ((line: string) => console.error(line));
  const setTimer: SetTimer =
    options.setTimer ??
    ((callback, ms) => {
      const timer = setTimeout(callback, ms);
      timer.unref();
      return timer;
    });
  const limiter = new LogLimiter(now, setTimer, log);
  const verifier = createTicketVerifier();
  const ticketKey = lazyTicketKey(() => env.BETTER_AUTH_SECRET);
  const states = new WeakMap<Duplex, UpgradeState>();
  const live = new Set<RelayPair>();

  function refuse(
    socket: Duplex,
    state: UpgradeState,
    status: number,
    reason: RefusalReason,
  ): void {
    state.hasAnswered = true;
    answer(socket, status);
    limiter.line(reason, reason, refusedLine(state.conn, reason));
  }

  function upstreamFailed(state: UpgradeState, client: Socket, detail: string): void {
    log(upstreamFailedLine(state.conn, detail));
    if (!state.hasAnswered) {
      state.hasAnswered = true;
      answer(client, 502);
    }
    state.pair?.destroy();
  }

  // The checks before any upstream contact, in the order of design 3.3 item 3; the ticket's payload on success.
  function check(
    request: IncomingMessage,
    socket: Duplex,
    state: UpgradeState,
  ): Accepted | undefined {
    const key = headerOf(request, "sec-websocket-key");
    if (
      request.method !== "GET" ||
      headerOf(request, "upgrade")?.toLowerCase() !== "websocket" ||
      headerOf(request, "sec-websocket-version") !== "13" ||
      key === undefined ||
      !WEBSOCKET_KEY.test(key)
    ) {
      refuse(socket, state, 400, "bad-request");
      return undefined;
    }
    const host = headerOf(request, "host");
    if (host === undefined || !LOOPBACK_HOST.test(host)) {
      refuse(socket, state, 403, "forbidden-host");
      return undefined;
    }
    if (headerOf(request, "origin") !== `http://${host}`) {
      refuse(socket, state, 403, "forbidden-origin");
      return undefined;
    }
    const tickets = new URL(request.url ?? "", "http://localhost").searchParams.getAll("ticket");
    const [token] = tickets;
    if (tickets.length !== 1 || token === undefined) {
      refuse(socket, state, 401, "bad-ticket");
      return undefined;
    }
    const serviceUrl = env.WORKSPACE_SERVICE_URL;
    const secret = env.WORKSPACE_SERVICE_SECRET;
    let ticketKeyBytes: Buffer;
    try {
      ticketKeyBytes = ticketKey();
    } catch {
      refuse(socket, state, 503, "unconfigured");
      return undefined;
    }
    if (serviceUrl === undefined || serviceUrl === "" || secret === undefined || secret === "") {
      refuse(socket, state, 503, "unconfigured");
      return undefined;
    }
    const verdict = verifier.verify(token, ticketKeyBytes, now());
    if (!verdict.ok) {
      refuse(socket, state, 401, "bad-ticket");
      return undefined;
    }
    return { payload: verdict.payload, serviceUrl, secret, websocketKey: key };
  }

  function connect(client: Socket, head: Buffer, state: UpgradeState, accepted: Accepted): void {
    const { payload } = accepted;
    let upstreamRequest: ClientRequest;
    try {
      const path = `/v1/users/${encodeURIComponent(payload.u)}/courses/${encodeURIComponent(
        payload.c,
      )}/lessons/${encodeURIComponent(payload.l)}/workspace/terminal`;
      const target = new URL(path, accepted.serviceUrl);
      // Exactly these headers: nothing the browser sent reaches the service but its WebSocket key.
      upstreamRequest = httpRequest(target, {
        agent: false,
        method: "GET",
        headers: {
          Connection: "Upgrade",
          Upgrade: "websocket",
          "Sec-WebSocket-Version": "13",
          "Sec-WebSocket-Key": accepted.websocketKey,
          Authorization: `Bearer ${accepted.secret}`,
          "X-Academy-Conn": state.conn,
          Host: target.host,
        },
      });
    } catch (error: unknown) {
      upstreamFailed(state, client, systemCodeOf(error));
      return;
    }
    const pair = new RelayPair(client, upstreamRequest, live);
    state.pair = pair;
    upstreamRequest.on("error", (error: unknown) => {
      if (!pair.isDestroyed) upstreamFailed(state, client, systemCodeOf(error));
    });
    upstreamRequest.on("response", (response: IncomingMessage) => {
      pair.clearConnectTimer();
      response.resume();
      upstreamFailed(state, client, String(response.statusCode ?? "-"));
    });
    upstreamRequest.on(
      "upgrade",
      (response: IncomingMessage, upstream: Socket, upstreamHead: Buffer) => {
        pair.clearConnectTimer();
        pair.adoptUpstream(upstream);
        const accept = response.headers["sec-websocket-accept"];
        if (typeof accept !== "string" || !WEBSOCKET_ACCEPT.test(accept)) {
          upstreamFailed(state, client, "bad-accept");
          return;
        }
        if (!client.writable) {
          pair.destroy();
          return;
        }
        state.hasAnswered = true;
        client.write(
          `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
        );
        if (upstreamHead.length > 0) client.write(upstreamHead);
        if (head.length > 0) upstream.write(head);
        // An idle terminal is normal: no socket timeout on either side, keep-alive probes find dead peers.
        for (const socket of [client, upstream]) {
          socket.setTimeout(0);
          socket.setNoDelay(true);
          socket.setKeepAlive(true, KEEP_ALIVE_MS);
        }
        client.pipe(upstream);
        upstream.pipe(client);
        const connectedAt = now();
        const deadline = Math.min(payload.dl, connectedAt + capSeconds * 1000);
        pair.armDeadline(deadline - connectedAt, () => log(cutAtDeadlineLine(state.conn)));
      },
    );
    pair.armConnectTimer(connectTimeoutMs, () => log(upstreamFailedLine(state.conn, "timeout")));
    upstreamRequest.end();
  }

  return {
    async handle(request, socket, head) {
      const state: UpgradeState = {
        conn: randomConnectionId(),
        hasAnswered: false,
        pair: undefined,
      };
      states.set(socket, state);
      // Node's http.Server always hands a net.Socket to `upgrade`; anything else is contained.
      if (!(socket instanceof Socket)) throw new TypeError("upgrade socket is not a net.Socket");
      const accepted = check(request, socket, state);
      if (accepted === undefined) return;
      connect(socket, head, state, accepted);
    },

    contain(socket, error) {
      try {
        // No state: the dispatch failed before the relay saw the socket, so nothing was answered yet.
        const state = states.get(socket);
        if (state?.hasAnswered !== true && socket.writable) {
          if (state !== undefined) state.hasAnswered = true;
          answer(socket, 400);
        } else {
          socket.destroy();
        }
        state?.pair?.destroy();
        const name = errorNameOf(error);
        // Keyed by the error's name (S5-N1), so a flood of one kind cannot hide another kind's first line.
        limiter.line(`contained:${name}`, "contained", containedLine(state?.conn ?? "-", name));
      } catch {
        try {
          socket.destroy();
        } catch {
          // Nothing is left to release.
        }
      }
    },

    destroyAll() {
      for (const pair of [...live]) pair.destroy();
    },
  };
}
