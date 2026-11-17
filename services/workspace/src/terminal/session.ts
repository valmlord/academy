import type { Duplex } from "node:stream";
import type { WebSocket } from "@fastify/websocket";
import { SerializeAddon } from "@xterm/addon-serialize";
import xtermHeadless from "@xterm/headless";
import { errorCode, errorName } from "../log-fields.js";
import type { ServiceLog } from "../manager.js";
import type { ShellHandle } from "../runtime.js";
import {
  attachedFrame,
  CLOSE,
  CLOSE_REASON,
  type EndCode,
  exitReason,
  parseClientMessage,
  snapshotFrame,
} from "./protocol.js";

// One terminal session per workspace (design 3.2.1, ADR-0011 item 4): the exec stream, the server-held screen
// that a reconnect replays, at most one attached socket (`client`) and one attaching socket (`pending`). Every
// listener and callback body is contained (design 3.2.2): a throw ends the session with 1011.

// `@xterm/headless` is CommonJS without named-export shims under plain Node (R-SVC-SMOKE).
const { Terminal } = xtermHeadless;

/** Flow-control gates (design 3.2.1): set above the high mark, cleared at or below the low mark. */
const HIGH_WATER_BYTES = 1024 * 1024;
const LOW_WATER_BYTES = 256 * 1024;
/** The size Docker gives the exec's TTY (`ConsoleSize`), until the browser's first `resize`. */
export const START_SIZE = { cols: 80, rows: 24 };
/**
 * How long input waits behind an exec resize before it is written anyway (#160 D3). A healthy resize takes tens
 * of ms, so 2 s is far above it even when Docker is slow; it stays well below the 30 s heartbeat (a hold pause never
 * costs a pong) and docker-modem's 30 s inactivity timeout. A 2 s freeze during a Docker hiccup is tolerable, while
 * 10 s would read as a dead terminal.
 */
const RESIZE_HOLD_MS = 2_000;
/**
 * Held input above which the sender's socket is paused (#160 D4): the protocol's 64 KiB frame limit (route.ts
 * `MAX_MESSAGE_BYTES`, ADR-0011 item 6), i.e. eight `input` frames at their 8192-unit maximum. A typist never
 * reaches it, so acks are not delayed in normal use, while a paste is paused at a known size. UTF-16 units
 * (`data.length`), because the protocol limits `d` in those units.
 */
const HELD_INPUT_PAUSE_UNITS = 64 * 1024;

/** The F5 log lines (design 3.8); none carries terminal bytes, input or an error's message. */
export const terminalLine = {
  ended: (workspaceId: string, conn: string, code: number): string =>
    `terminal ${workspaceId} ${conn}: ended ${code}`,
  execFailed: (workspaceId: string, conn: string, errorName: string): string =>
    `terminal ${workspaceId} ${conn}: exec failed (${errorName})`,
  socketError: (workspaceId: string, conn: string, code: string): string =>
    `terminal ${workspaceId} ${conn}: socket error (${code})`,
  resizeFailed: (workspaceId: string, conn: string, errorName: string): string =>
    `terminal ${workspaceId} ${conn}: resize failed (${errorName})`,
  resizeHoldReleased: (workspaceId: string, conn: string): string =>
    `terminal ${workspaceId} ${conn}: resize hold released`,
  killFailed: (workspaceId: string, conn: string, errorName: string): string =>
    `terminal ${workspaceId} ${conn}: kill failed (${errorName})`,
};

/**
 * Starts the kill of the shell's process session without waiting for it (#110); a failure reaches `onFailure` as
 * an `errorName` only. Both a synchronous throw and a rejection are contained (the 3.2.2 C1 pattern): the callers
 * run inside catch blocks and `end` must never throw, and the port cannot promise that every adapter's `terminate`
 * is an async function.
 */
export function startShellKill(shell: ShellHandle, onFailure: (errorName: string) => void): void {
  let started: Promise<void>;
  try {
    started = shell.terminate();
  } catch (error: unknown) {
    onFailure(errorName(error));
    return;
  }
  started.catch((error: unknown) => onFailure(errorName(error)));
}

/** The server-held screen: a headless xterm fed with every byte of output, serialized on a resumed attach. */
export interface HeadlessScreen {
  /** `callback` runs once xterm has parsed `data`, in write order (`""` flushes what was written before). */
  write(data: string | Uint8Array, callback: () => void): void;
  resize(cols: number, rows: number): void;
  serialize(): string;
  dispose(): void;
}

export interface ScreenOptions {
  cols: number;
  rows: number;
  scrollback: number;
}

/**
 * The real screen. `allowProposedApi` is required: `SerializeAddon.serialize()` throws without it. The
 * terminal is never reset (design 3.2 "Screen and replay"): it is fed in order and only disposed.
 */
export function createHeadlessScreen(options: ScreenOptions): HeadlessScreen {
  const terminal = new Terminal({
    cols: options.cols,
    rows: options.rows,
    scrollback: options.scrollback,
    allowProposedApi: true,
  });
  const serializer = new SerializeAddon();
  terminal.loadAddon(serializer);
  return {
    write: (data, callback) => terminal.write(data, callback),
    resize: (cols, rows) => terminal.resize(cols, rows),
    serialize: () => serializer.serialize(),
    dispose: () => {
      serializer.dispose();
      terminal.dispose();
    },
  };
}

/** `ws`'s `RawData`: what a `message` listener receives. */
type RawData = Buffer | ArrayBuffer | Buffer[];

function textOf(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  return Buffer.isBuffer(data) ? data.toString("utf8") : Buffer.from(data).toString("utf8");
}

/** A late `error` from a destroyed stream has nothing left to act on (design 3.2.2 C9). */
const ignoreLateError = (): void => undefined;

/**
 * One incoming WebSocket and its four listeners (`error`, `close`, `message`, `pong`), attached in the
 * constructor, so synchronously in the route's `wsHandler` and before any `await`: no frame is dropped. The
 * listeners forward to the session the socket joined; the session decides by role (client, pending, or
 * neither) whether an event counts.
 */
export class TerminalConnection {
  readonly socket: WebSocket;
  /** The relay's `X-Academy-Conn` id, or `-`: a log correlation id only. */
  readonly conn: string;
  #session: Session | null = null;
  readonly #onError: (error: Error) => void;
  readonly #onClose: () => void;
  readonly #onMessage: (data: RawData, isBinary: boolean) => void;
  readonly #onPong: () => void;

  constructor(socket: WebSocket, conn: string, workspaceId: string, log: ServiceLog) {
    this.socket = socket;
    this.conn = conn;
    // `ws` follows an `error` with `close`, which is what detaches the socket (row 10 or 11).
    this.#onError = (error) =>
      log.warn(terminalLine.socketError(workspaceId, conn, errorCode(error) ?? "-"));
    this.#onClose = () => this.#dispatch((session) => session.onClose(this));
    this.#onMessage = (data, isBinary) =>
      this.#dispatch((session) => session.onMessage(this, data, isBinary));
    this.#onPong = () => this.#dispatch((session) => session.onPong(this));
    socket.on("error", this.#onError);
    socket.on("close", this.#onClose);
    socket.on("message", this.#onMessage);
    socket.on("pong", this.#onPong);
  }

  joined(session: Session): void {
    this.#session = session;
  }

  removeListeners(): void {
    this.socket.off("error", this.#onError);
    this.socket.off("close", this.#onClose);
    this.socket.off("message", this.#onMessage);
    this.socket.off("pong", this.#onPong);
  }

  get isOpen(): boolean {
    return this.socket.readyState === this.socket.OPEN;
  }

  close(code: number, reason?: string): void {
    if (this.isOpen) this.socket.close(code, reason);
  }

  /** Before the socket joins a session (the session is still being created), its events change nothing. */
  #dispatch(handle: (session: Session) => void): void {
    const session = this.#session;
    if (session === null) return;
    try {
      handle(session);
    } catch {
      session.end(CLOSE.internal);
    }
  }
}

export interface SessionOptions {
  workspaceId: string;
  shell: ShellHandle;
  screen: HeadlessScreen;
  /** The connection that created the session: its attach reports `resumed: false`, every other one `true`. */
  createdBy: TerminalConnection;
  /** Row 21: whether the workspace's container still runs once the exec stream has ended. */
  isContainerRunning: () => Promise<boolean>;
  /** Moves the workspace's idle window (`WorkspaceManager.touchFromTerminal`). */
  touch: () => void;
  log: ServiceLog;
  /** Called once by `end`, so the registry drops its entry when it still maps to this session. */
  onEnd: (session: Session) => void;
  heartbeatMs: number;
}

interface Gates {
  flush: boolean;
  ack: boolean;
  buffer: boolean;
  parse: boolean;
}

/** One exec resize: the size and the id of the connection that sent it, which its log lines name (C1). */
interface ResizeRequest {
  cols: number;
  rows: number;
  conn: string;
}

/**
 * Input while exec resizes are in flight (#160): `holding` queues it until the last one settles; `released` means
 * the hold timer fired first, so input is written at once again until the resizes are done.
 */
type HoldState = "idle" | "holding" | "released";

function gateAfter(isSet: boolean, bytes: number): boolean {
  return isSet ? bytes > LOW_WATER_BYTES : bytes > HIGH_WATER_BYTES;
}

/** The session state machine of design 3.2.1; row numbers in the comments refer to its table. */
export class Session {
  readonly workspaceId: string;
  readonly #options: SessionOptions;
  readonly #stream: Duplex;
  readonly #screen: HeadlessScreen;
  readonly #createdBy: TerminalConnection;
  #client: TerminalConnection | null = null;
  #pending: TerminalConnection | null = null;
  #flushToken = 0;
  #stopping = false;
  #endTriggered = false;
  #ended = false;
  /** Output bytes sent to the current client and acknowledged by it; both reset at every attach. */
  #sent = 0;
  #acked = 0;
  /** Output bytes handed to the headless parser whose parse callback has not run yet. */
  #unparsed = 0;
  readonly #gates: Gates = { flush: false, ack: false, buffer: false, parse: false };
  #isStreamPaused = true;
  /** The client whose input filled the exec stream; resumed at the stream's `drain` (row 15). */
  #pausedForDrain: TerminalConnection | null = null;
  /** The exec resize sent and not settled yet; `null` when the resize chain is idle. */
  #resizeInFlight: ResizeRequest | null = null;
  /** The newest size received while a resize was in flight; it replaces any older one (latest wins). */
  #pendingResize: ResizeRequest | null = null;
  #hold: HoldState = "idle";
  /** One timer per busy period of the resize chain, never restarted by a later resize (D2). */
  #holdTimer: NodeJS.Timeout | null = null;
  #heldInput: string[] = [];
  #heldUnits = 0;
  /** The client paused because the held input grew above `HELD_INPUT_PAUSE_UNITS`; resumed at the flush. */
  #pausedForHold: TerminalConnection | null = null;
  #heartbeat: NodeJS.Timeout | null = null;
  /** Per socket, so a client attached by takeover never inherits its predecessor's missed pong (row 7). */
  readonly #awaitingPong = new WeakMap<WebSocket, boolean>();
  /** The connection id F5a names: the last connection that joined. */
  #lastConn: string;
  readonly #onData = (chunk: Buffer): void => this.#contained(() => this.#onOutput(chunk));
  readonly #onShellEnd = (): void => this.#contained(() => this.#shellEnded());
  readonly #onDrain = (): void =>
    this.#contained(() => {
      const drained = this.#pausedForDrain;
      this.#pausedForDrain = null;
      this.#resumeUnlessPaused(drained);
    });

  constructor(options: SessionOptions) {
    this.workspaceId = options.workspaceId;
    this.#options = options;
    this.#stream = options.shell.stream;
    this.#screen = options.screen;
    this.#createdBy = options.createdBy;
    this.#lastConn = options.createdBy.conn;
    // Paused before the `data` listener exists, so no output is read until the first attach's flush has run
    // and decided where it goes.
    this.#stream.pause();
    this.#stream.on("data", this.#onData);
    this.#stream.on("end", this.#onShellEnd);
    this.#stream.on("close", this.#onShellEnd);
    this.#stream.on("error", this.#onShellEnd);
    this.#stream.on("drain", this.#onDrain);
  }

  isCreatedBy(connection: TerminalConnection): boolean {
    return connection === this.#createdBy;
  }

  /** Rows 3, 4, 5 and 5a: a new connection takes the session; the one it replaces gets 4001. */
  join(connection: TerminalConnection): void {
    connection.joined(this);
    this.#lastConn = connection.conn;
    if (this.#stopping) {
      connection.removeListeners();
      connection.close(CLOSE.environmentStopped, CLOSE_REASON.environmentStopped);
      return;
    }
    const replaced = this.#client ?? this.#pending;
    if (this.#client !== null) this.#detachClient();
    this.#pending = connection;
    this.#startFlush();
    if (replaced !== null) {
      replaced.removeListeners();
      replaced.close(CLOSE.takenOver, CLOSE_REASON.takenOver);
    }
  }

  /** Row 22: the exec end that follows a stop is the environment stopping, not the shell exiting. */
  markStopping(): void {
    this.#stopping = true;
  }

  /** Row 23: the stop failed (e.g. Docker unavailable), so the session keeps running. */
  clearStopping(): void {
    this.#stopping = false;
  }

  onClose(connection: TerminalConnection): void {
    if (connection === this.#client) {
      // Row 10.
      connection.removeListeners();
      this.#detachClient();
      this.#updateFlow();
    } else if (connection === this.#pending) {
      // Row 11: the flush callback then takes row 8.
      connection.removeListeners();
      this.#pending = null;
    }
  }

  onMessage(connection: TerminalConnection, data: RawData, isBinary: boolean): void {
    // Row 19: the pending socket and replaced sockets are ignored; the browser never sends before `attached`.
    if (connection !== this.#client) return;
    if (isBinary) {
      this.#dropClient(CLOSE.unsupportedData);
      return;
    }
    const message = parseClientMessage(textOf(data));
    if (message === null) {
      this.#dropClient(CLOSE.policy, CLOSE_REASON.invalidMessage);
      return;
    }
    if (message.t === "input") this.#input(connection, message.d);
    else if (message.t === "resize") this.#resize(connection, message.cols, message.rows);
    else this.#ack(message.n);
  }

  onPong(connection: TerminalConnection): void {
    this.#awaitingPong.set(connection.socket, false);
  }

  /**
   * The one teardown (idempotent). Destroying the exec stream releases the service's side; every end except 4002
   * also starts the kill of the shell's process session (fire-and-forget, a failure is logged: #110). 4002 needs
   * none: the container is stopping and takes every process with it. The headless Terminal is disposed, never
   * reset first; writes still queued in it are parsed by xterm's scheduled timer, and their
   * callbacks then return on `ended` (A5-N4).
   */
  end(code: EndCode, exitText?: string): void {
    if (this.#ended) return;
    this.#ended = true;
    this.#options.onEnd(this);
    if (this.#heartbeat !== null) {
      clearInterval(this.#heartbeat);
      this.#heartbeat = null;
    }
    if (this.#holdTimer !== null) {
      clearTimeout(this.#holdTimer);
      this.#holdTimer = null;
    }
    this.#heldInput = [];
    this.#heldUnits = 0;
    this.#pendingResize = null;
    this.#stream.off("data", this.#onData);
    this.#stream.off("end", this.#onShellEnd);
    this.#stream.off("close", this.#onShellEnd);
    this.#stream.off("error", this.#onShellEnd);
    this.#stream.off("drain", this.#onDrain);
    this.#stream.on("error", ignoreLateError);
    this.#stream.destroy();
    // Before the sockets close and the screen is disposed, so the kill is started even if a later step throws.
    if (code !== CLOSE.environmentStopped) {
      startShellKill(this.#options.shell, (name) =>
        this.#options.log.warn(terminalLine.killFailed(this.workspaceId, this.#lastConn, name)),
      );
    }
    const reason = endReason(code, exitText);
    for (const connection of [this.#client, this.#pending]) {
      if (connection === null) continue;
      connection.removeListeners();
      connection.close(code, reason);
    }
    this.#client = null;
    this.#pending = null;
    this.#screen.dispose();
    this.#options.log.info(terminalLine.ended(this.workspaceId, this.#lastConn, code));
  }

  /** Row 6: output stays paused until xterm has parsed everything written before the flush. */
  #startFlush(): void {
    this.#flushToken += 1;
    const token = this.#flushToken;
    this.#gates.flush = true;
    this.#updateFlow();
    this.#screen.write("", () => this.#afterParse(() => this.#flushed(token)));
  }

  /** Rows 7, 8 and 9. */
  #flushed(token: number): void {
    // Redundant while the stream stays paused from the first flush to the last: a stale callback would attach the
    // same newest pending socket. Kept so row 9 does not depend on that pause invariant, held in `#updateFlow`.
    if (token !== this.#flushToken) return;
    this.#gates.flush = false;
    const pending = this.#pending;
    this.#pending = null;
    if (pending !== null && pending.isOpen) {
      // The client before the sends, so a throw while serializing (C5) ends the session with this socket in it.
      this.#client = pending;
      this.#sent = 0;
      this.#acked = 0;
      this.#awaitingPong.set(pending.socket, false);
      const resumed = pending !== this.#createdBy;
      this.#send(pending, attachedFrame(resumed));
      if (resumed) this.#send(pending, snapshotFrame(this.#screen.serialize()));
      this.#startHeartbeat();
    } else {
      pending?.removeListeners();
    }
    this.#refreshGates();
  }

  /** Row 20. */
  #onOutput(chunk: Buffer): void {
    this.#unparsed += chunk.length;
    this.#screen.write(chunk, () =>
      this.#afterParse(() => {
        this.#unparsed -= chunk.length;
        this.#refreshGates();
      }),
    );
    const client = this.#client;
    if (client !== null) {
      this.#sent += chunk.length;
      this.#send(client, chunk);
      this.#options.touch();
    }
    this.#refreshGates();
  }

  /**
   * Row 15. The resize and the input reach dockerd over different connections, so input that follows a resize is
   * held while the resize chain is busy, until the TTY has the new size (#160); after `RESIZE_HOLD_MS` it is written
   * anyway. Touch stays at receipt, held or not (ADR-0011 item 8).
   */
  #input(client: TerminalConnection, data: string): void {
    if (this.#hold === "holding") this.#holdInput(client, data);
    else this.#writeInput(client, data);
    this.#options.touch();
  }

  /**
   * The one write to the exec stream, for direct and for held input, so every byte gets row 15's pause when the
   * stream is full. `client` is the socket to pause; `null` (a flush with nobody attached) only writes.
   */
  #writeInput(client: TerminalConnection | null, data: string): void {
    if (!this.#stream.write(data)) {
      if (client === null) return;
      client.socket.pause();
      this.#pausedForDrain = client;
    }
  }

  /** Bounds the held queue by pausing the sender above `HELD_INPUT_PAUSE_UNITS`; ws may still emit parsed frames. */
  #holdInput(client: TerminalConnection, data: string): void {
    this.#heldInput.push(data);
    this.#heldUnits += data.length;
    if (this.#heldUnits <= HELD_INPUT_PAUSE_UNITS || this.#pausedForHold === client) return;
    const previous = this.#pausedForHold;
    this.#pausedForHold = client;
    this.#resumeUnlessPaused(previous);
    client.socket.pause();
  }

  /** The one resume rule for both pause reasons: a socket runs again only when neither drain nor hold holds it. */
  #resumeUnlessPaused(client: TerminalConnection | null): void {
    const isStillPaused = client === this.#pausedForDrain || client === this.#pausedForHold;
    if (client === null || isStillPaused) return;
    client.socket.resume();
  }

  /**
   * Row 16: at most one exec resize in flight per session; later sizes coalesce into one pending slot, so a flood
   * costs one request per Docker round trip. The TTY's last applied size is then always the last size received,
   * the one `#screen` has. Every resize rejection is ignored and logged (3.2.2 C1), a 404 of an ended exec included.
   */
  #resize(client: TerminalConnection, cols: number, rows: number): void {
    const request: ResizeRequest = { cols, rows, conn: client.conn };
    if (this.#resizeInFlight === null) {
      this.#startHold();
      this.#sendResize(request);
    } else {
      this.#pendingResize = request;
    }
    this.#screen.resize(cols, rows);
    this.#options.touch();
  }

  #sendResize(request: ResizeRequest): void {
    this.#resizeInFlight = request;
    this.#options.shell.resize(request.cols, request.rows).then(
      () => this.#contained(() => this.#resizeSettled()),
      (error: unknown) =>
        this.#contained(() => {
          this.#options.log.warn(
            terminalLine.resizeFailed(this.workspaceId, request.conn, errorName(error)),
          );
          this.#resizeSettled();
        }),
    );
  }

  /** Only this settle callback starts a pending resize, so a late settle after a released hold never starts two. */
  #resizeSettled(): void {
    // `end()` also clears the pending slot and the held queue; both guards stop a late settle from writing or
    // sending, and T5 cannot tell them apart. This one also keeps a late settle off the destroyed stream.
    if (this.#ended) return;
    const next = this.#pendingResize;
    this.#pendingResize = null;
    if (next !== null) {
      this.#sendResize(next);
      return;
    }
    this.#resizeInFlight = null;
    this.#endHold();
  }

  /** The chain went from idle to busy: hold input for at most `RESIZE_HOLD_MS` of this busy period. */
  #startHold(): void {
    this.#hold = "holding";
    this.#holdTimer = setTimeout(() => this.#contained(() => this.#releaseHold()), RESIZE_HOLD_MS);
    this.#holdTimer.unref();
  }

  /** The chain is idle again: the held input, if still held, goes out in arrival order. */
  #endHold(): void {
    const wasHolding = this.#hold === "holding";
    this.#hold = "idle";
    if (!wasHolding) return;
    if (this.#holdTimer !== null) {
      clearTimeout(this.#holdTimer);
      this.#holdTimer = null;
    }
    this.#flushHeldInput();
  }

  /** Docker took over `RESIZE_HOLD_MS`: input runs again while the resize keeps going; the only sign it is slow. */
  #releaseHold(): void {
    this.#holdTimer = null;
    this.#hold = "released";
    // Never null while holding; `-` is the mark for an unknown connection id, as elsewhere in the F5 lines.
    const conn = this.#resizeInFlight?.conn ?? "-";
    this.#options.log.warn(terminalLine.resizeHoldReleased(this.workspaceId, conn));
    this.#flushHeldInput();
  }

  /**
   * Writes first, then clears the hold pause, then applies the resume rule: in the other order the rule would
   * resume a socket that the flush's own writes are about to pause for drain. Held input of a client that has left
   * is written too (D6): it was accepted from the then-current client, and before #160 it was already written.
   */
  #flushHeldInput(): void {
    const held = this.#heldInput;
    this.#heldInput = [];
    this.#heldUnits = 0;
    for (const data of held) this.#writeInput(this.#client, data);
    const paused = this.#pausedForHold;
    this.#pausedForHold = null;
    this.#resumeUnlessPaused(paused);
  }

  /** Row 14. */
  #ack(bytes: number): void {
    this.#acked += bytes;
    if (this.#acked > this.#sent) {
      this.#dropClient(CLOSE.policy, CLOSE_REASON.ackExceedsSent);
      return;
    }
    this.#refreshGates();
  }

  /** Row 21: only the first of `end`, `close` and `error` counts. */
  #shellEnded(): void {
    if (this.#endTriggered || this.#ended) return;
    this.#endTriggered = true;
    if (this.#stopping) {
      this.end(CLOSE.environmentStopped);
      return;
    }
    this.#options
      .isContainerRunning()
      .then(async (isRunning) => {
        if (!isRunning) {
          this.end(CLOSE.environmentStopped);
          return;
        }
        // 3.2.2 C2b: an exit code Docker cannot report is `exit unknown`.
        const exitCode = await this.#options.shell.exitCode().catch(() => null);
        this.end(CLOSE.exited, exitReason(exitCode));
      })
      // 3.2.2 C2: the container's state is unknown, so the session cannot say why it ended.
      .catch(() => this.end(CLOSE.internal));
  }

  /** Row 13 and 3.2.2 C6. */
  #startHeartbeat(): void {
    if (this.#heartbeat !== null) return;
    this.#heartbeat = setInterval(() => this.#tick(), this.#options.heartbeatMs);
    this.#heartbeat.unref();
  }

  #tick(): void {
    const client = this.#client;
    if (client === null) return;
    try {
      if (this.#awaitingPong.get(client.socket) === true) {
        client.socket.terminate();
        return;
      }
      this.#awaitingPong.set(client.socket, true);
      client.socket.ping();
    } catch {
      client.socket.terminate();
    }
  }

  /** 3.2.2 C8: a failed send is the client leaving (row 10); every send callback re-checks the buffer gate. */
  #send(connection: TerminalConnection, data: string | Buffer): void {
    connection.socket.send(data, { binary: typeof data !== "string" }, (error) =>
      this.#contained(() => {
        if (error !== undefined && error !== null && connection === this.#client) {
          this.onClose(connection);
          return;
        }
        this.#refreshGates();
      }),
    );
  }

  /** Rows 14, 17 and 18: we close the client and treat it as gone at once (row 10). */
  #dropClient(code: number, reason?: string): void {
    const client = this.#client;
    if (client === null) return;
    client.removeListeners();
    this.#detachClient();
    this.#updateFlow();
    client.close(code, reason);
  }

  /** Detach: the gates that belong to the leaving client are cleared, so a paused shell runs on. */
  #detachClient(): void {
    this.#client = null;
    this.#sent = 0;
    this.#acked = 0;
    this.#gates.ack = false;
    this.#gates.buffer = false;
  }

  #refreshGates(): void {
    this.#gates.parse = gateAfter(this.#gates.parse, this.#unparsed);
    // Without a client the ack and buffer gates stay as the detach left them: cleared.
    const client = this.#client;
    if (client !== null) {
      this.#gates.ack = gateAfter(this.#gates.ack, this.#sent - this.#acked);
      this.#gates.buffer = gateAfter(this.#gates.buffer, client.socket.bufferedAmount);
    }
    this.#updateFlow();
  }

  /** The exec stream is paused while any gate is set and resumed when all are clear. */
  #updateFlow(): void {
    if (this.#ended) return;
    const { flush, ack, buffer, parse } = this.#gates;
    const shouldPause = flush || ack || buffer || parse;
    if (shouldPause && !this.#isStreamPaused) this.#stream.pause();
    if (!shouldPause && this.#isStreamPaused) this.#stream.resume();
    this.#isStreamPaused = shouldPause;
  }

  /**
   * 3.2.2 C5: xterm calls write callbacks from a timer without a guard, so a throw here would be uncaught;
   * after `end` the callback has nothing left to do.
   */
  #afterParse(body: () => void): void {
    if (this.#ended) return;
    this.#contained(body);
  }

  /** Every listener and callback body: a throw ends the session with 1011 (design 3.2.2). */
  #contained(body: () => void): void {
    try {
      body();
    } catch {
      this.end(CLOSE.internal);
    }
  }
}

function endReason(code: EndCode, exitText: string | undefined): string {
  if (code === CLOSE.exited) return exitText ?? CLOSE_REASON.exitUnknown;
  if (code === CLOSE.environmentStopped) return CLOSE_REASON.environmentStopped;
  if (code === CLOSE.shuttingDown) return CLOSE_REASON.shuttingDown;
  return CLOSE_REASON.internal;
}
