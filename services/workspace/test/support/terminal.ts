import fastifyWebsocket, { type WebSocket } from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import { type MockInstance, vi } from "vitest";
import { CourseLessons } from "../../src/course/lessons.js";
import { type WorkspaceKey, workspaceId } from "../../src/identity.js";
import { IdleTracker } from "../../src/idle.js";
import { KeyedMutex } from "../../src/lock.js";
import { type ServiceLog, WorkspaceManager } from "../../src/manager.js";
import { TerminalRegistry } from "../../src/terminal/registry.js";
import { createHeadlessScreen, type HeadlessScreen } from "../../src/terminal/session.js";
import { FakeRuntime, type FakeShell } from "./fake-runtime.js";

// The terminal registry over real `ws` sockets (Fastify's `injectWS`, no network) and the in-memory runtime,
// for the session unit tests of design 10.1. The test route only hands each socket to `registry.connect`,
// the way the service's own route does; the route's own rules (Bearer, key, plain GET) are U-route's.

export const INSTANCE = "local";
export const T0 = Date.parse("2026-11-04T10:00:00Z");
export const KEY: WorkspaceKey = {
  userId: "user-1",
  courseId: "course-a",
  lessonId: "with-workspace",
};
export const OTHER_KEY: WorkspaceKey = { ...KEY, userId: "user-2" };
export const ID = workspaceId(INSTANCE, KEY);
const SOCKET_PATH = "/terminal";
const MINUTE = 60_000;

const COURSE = new CourseLessons([
  {
    courseId: "course-a",
    lessonId: "with-workspace",
    lessonDir: "course-a/01-basics/01-with-workspace",
    workspace: { image: "academy-workspace:dev", starter: "starter" },
    commandChecks: [],
  },
]);

/**
 * A headless screen whose write callbacks the test controls. Each callback runs from a timer, as xterm's
 * `WriteBuffer` does, either at once (`setTimeout(0)`) or when the test calls `release()`.
 */
export class FakeScreen implements HeadlessScreen {
  /** Everything written so far, decoded: what `serialize()` returns. */
  text = "";
  isDeferred = false;
  /** Makes `serialize()` throw, so the body of a flush callback throws (3.2.2 C5). */
  serializeError: Error | null = null;
  disposeCalls = 0;
  /** Counts `reset()`, which the session must never call (design 3.2 "Screen and replay", A4-B1). */
  resetCalls = 0;
  readonly resizes: string[] = [];
  readonly #queued: (() => void)[] = [];

  write(data: string | Uint8Array, callback: () => void): void {
    this.#queued.push(() => {
      this.text += typeof data === "string" ? data : Buffer.from(data).toString("utf8");
      callback();
    });
    if (!this.isDeferred) setTimeout(() => this.release(), 0);
  }

  /** Parses every queued write, in order, from a timer callback. */
  release(): void {
    for (const parse of this.#queued.splice(0)) parse();
  }

  get queued(): number {
    return this.#queued.length;
  }

  resize(cols: number, rows: number): void {
    this.resizes.push(`${cols}x${rows}`);
  }

  serialize(): string {
    if (this.serializeError !== null) throw this.serializeError;
    return this.text;
  }

  dispose(): void {
    this.disposeCalls += 1;
  }

  reset(): void {
    this.resetCalls += 1;
  }
}

/** One frame the client received: parsed JSON for text, the bytes for binary. */
export type Frame = { kind: "text"; value: unknown } | { kind: "binary"; data: Buffer };

export interface CloseEvent {
  code: number;
  reason: string;
}

export interface TestClient {
  ws: WebSocket;
  frames: Frame[];
  /** Resolves with the close the client saw. */
  closed: Promise<CloseEvent>;
  /** Everything received as binary, decoded. */
  output(): string;
  send(message: unknown): void;
}

export interface TerminalSetup {
  registry: TerminalRegistry;
  runtime: FakeRuntime;
  manager: WorkspaceManager;
  tracker: IdleTracker;
  clock: { now: number };
  /** Every line the registry and sessions logged. */
  logged: string[];
  screens: FakeScreen[];
  app: FastifyInstance;
  /**
   * The listener the registry attached for `event` on the `index`-th server-side socket. Calling it delivers
   * the event even after the registry removed the listener, as a late event from a replaced socket would.
   */
  serverListener(index: number, event: string): (...args: unknown[]) => void;
  /** `key` may differ from `KEY` in its user only. */
  connect(options?: { conn?: string; key?: WorkspaceKey }): Promise<TestClient>;
  /**
   * The browser drops its connection. `terminate()`, because under `injectWS` the server-side socket of a
   * clean `close()` waits for ws's 30 s close timer before it emits `close`.
   */
  leave(client: TestClient): Promise<void>;
  shell(index?: number): FakeShell;
  close(): Promise<void>;
}

export interface TerminalSetupOptions {
  /** The real `@xterm/headless` screen instead of `FakeScreen`. */
  realScreen?: boolean;
  deferScreen?: boolean;
  /** Makes building the screen throw, after the exec has started (3.2.2 C4). */
  screenError?: Error;
  heartbeatMs?: number;
}

function decodeFrame(data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean): Frame {
  const bytes = Array.isArray(data)
    ? Buffer.concat(data)
    : Buffer.isBuffer(data)
      ? data
      : Buffer.from(data);
  return isBinary
    ? { kind: "binary", data: bytes }
    : { kind: "text", value: JSON.parse(bytes.toString("utf8")) };
}

export async function terminalSetup(options: TerminalSetupOptions = {}): Promise<TerminalSetup> {
  const clock = { now: T0 };
  const now = (): number => clock.now;
  const runtime = new FakeRuntime(INSTANCE);
  const logged: string[] = [];
  const log: ServiceLog = {
    info: (message) => logged.push(message),
    warn: (message) => logged.push(message),
  };
  const mutex = new KeyedMutex();
  const tracker = new IdleTracker({ stopMinutes: 30, warningMinutes: 5, now });
  const screens: FakeScreen[] = [];
  // The manager and the registry know each other, as in the service; the hooks run only once a stop does.
  const hooks = {
    onStopping: (id: string) => registry.onStopping(id),
    onStopRejected: (id: string) => registry.onStopRejected(id),
  };
  const manager = new WorkspaceManager({
    runtime,
    readCourse: async () => COURSE,
    instance: INSTANCE,
    imageOverride: null,
    tracker,
    mutex,
    log,
    now,
    stopHooks: hooks,
  });
  const registry = new TerminalRegistry({
    runtime,
    workspaces: manager,
    mutex,
    instance: INSTANCE,
    shell: "/bin/sh",
    scrollbackLines: 1000,
    log,
    heartbeatMs: options.heartbeatMs ?? MINUTE,
    createScreen:
      options.realScreen === true
        ? createHeadlessScreen
        : () => {
            if (options.screenError !== undefined) throw options.screenError;
            const screen = new FakeScreen();
            screen.isDeferred = options.deferScreen === true;
            screens.push(screen);
            return screen;
          },
  });
  const serverSockets: { socket: WebSocket; on: MockInstance<WebSocket["on"]> }[] = [];
  const app = Fastify({ logger: false });
  await app.register(fastifyWebsocket, { options: { maxPayload: 65_536 } });
  app.get(SOCKET_PATH, { websocket: true }, (socket, request) => {
    const userId = request.headers["x-test-user"];
    const key = typeof userId === "string" ? { ...KEY, userId } : KEY;
    const conn = request.headers["x-academy-conn"];
    serverSockets.push({ socket, on: vi.spyOn(socket, "on") });
    void registry.connect(key, socket, typeof conn === "string" ? conn : "-");
  });
  await app.ready();
  await manager.ensure(KEY);

  return {
    registry,
    runtime,
    manager,
    tracker,
    clock,
    logged,
    screens,
    app,
    async connect(connectOptions = {}) {
      const frames: Frame[] = [];
      let resolveClosed: (event: CloseEvent) => void = () => undefined;
      const closed = new Promise<CloseEvent>((resolve) => {
        resolveClosed = resolve;
      });
      const headers: Record<string, string> = {
        "x-test-user": (connectOptions.key ?? KEY).userId,
      };
      if (connectOptions.conn !== undefined) headers["x-academy-conn"] = connectOptions.conn;
      const ws = await app.injectWS(
        SOCKET_PATH,
        { headers },
        {
          // Listeners before the upgrade completes, or the first frame (`attached`) is lost (design 10.1).
          onInit: (socket) => {
            // An `injectWS` client is built without `autoPong`; a browser always answers a ping.
            socket.on("ping", () => socket.pong());
            socket.on("message", (data, isBinary) => frames.push(decodeFrame(data, isBinary)));
            socket.on("close", (code, reason) =>
              resolveClosed({ code, reason: reason.toString("utf8") }),
            );
          },
        },
      );
      return {
        ws,
        frames,
        closed,
        output: () =>
          frames
            .flatMap((frame) => (frame.kind === "binary" ? [frame.data.toString("utf8")] : []))
            .join(""),
        send: (message) => ws.send(JSON.stringify(message)),
      };
    },
    serverListener(index, event) {
      const server = serverSockets[index];
      const found = server?.on.mock.calls.find(([name]) => name === event);
      if (server === undefined || found === undefined) {
        throw new Error(`socket ${index} has no ${event} listener`);
      }
      const [, listener] = found;
      return (...args) => listener.apply(server.socket, args);
    },
    async leave(client) {
      const before = app.websocketServer.clients.size;
      client.ws.terminate();
      await vi.waitFor(() => {
        if (app.websocketServer.clients.size !== before - 1) throw new Error("server socket open");
      });
    },
    shell(index = 0) {
      const shell = runtime.shells[index];
      if (shell === undefined) throw new Error(`no shell ${index} was opened`);
      return shell;
    },
    async close() {
      registry.closeAll();
      await app.close();
    },
  };
}

/** The parsed text frames of a client, in order. */
export function texts(client: TestClient): unknown[] {
  return client.frames.flatMap((frame) => (frame.kind === "text" ? [frame.value] : []));
}

export async function waitForAttached(client: TestClient): Promise<void> {
  await vi.waitFor(() => {
    if (!texts(client).some((value) => isAttached(value))) throw new Error("not attached yet");
  });
}

function isAttached(value: unknown): boolean {
  return typeof value === "object" && value !== null && Reflect.get(value, "t") === "attached";
}

/** Everything the fake shell received as input, decoded. */
export function shellInput(shell: FakeShell): () => string {
  let input = "";
  shell.peer.on("data", (chunk: Buffer) => {
    input += chunk.toString("utf8");
  });
  return () => input;
}

/** Spies on the process-level error events for one test; `seen()` flushes twice before reading (10.1). */
export function processErrorSpy(): { seen: () => Promise<string[]>; stop: () => void } {
  const events: string[] = [];
  const onRejection = (): void => {
    events.push("unhandledRejection");
  };
  const onException = (): void => {
    events.push("uncaughtException");
  };
  process.on("unhandledRejection", onRejection);
  process.on("uncaughtException", onException);
  return {
    seen: async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      return [...events];
    },
    stop: () => {
      process.off("unhandledRejection", onRejection);
      process.off("uncaughtException", onException);
    },
  };
}
