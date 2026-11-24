import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Duplex } from "node:stream";
import { setTimeout as sleep } from "node:timers/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CHECK_CLEANUP_TIMEOUT_MS, CLEANUP_POLL_MS } from "../../../src/docker/check-process.js";
import { CHECK_MARKER } from "../../../src/docker/demux.js";
import { DockerEngine } from "../../../src/docker/engine.js";
import { DockerRuntime } from "../../../src/docker/runtime.js";
import type { ExecInspect } from "../../../src/docker/schemas.js";
import { checkCleanupExecCreateBody } from "../../../src/docker/spec.js";
import {
  CheckNotStartedError,
  DockerApiError,
  DockerResponseShapeError,
  DockerUnavailableError,
  WorkspaceIdentityMismatchError,
} from "../../../src/errors.js";
import {
  type Labels,
  type WorkspaceKey,
  workspaceId,
  workspaceLabels,
  workspaceNames,
} from "../../../src/identity.js";
import type { CheckProcess, CheckStartSpec, CleanupResult } from "../../../src/runtime.js";

// U-runtime-check: DockerRuntime.startCheck and its CheckProcess against a fake daemon on a temp unix socket (the
// upgrade pattern of exec.test.ts, with the container and volume inspects, the archive put, the exec create, the
// attached start and the exec inspect of a check, each recorded). The attach stream cases that need a socket error
// or a close use a Duplex double instead: a unix-socket peer that goes away with nothing unread gives the client a
// clean end, never an error.

const INSTANCE = "t198";
const KEY: WorkspaceKey = { userId: "user-1", courseId: "course-a", lessonId: "with-workspace" };
/** Another user of the same instance: labels that differ from the key's in the user id alone. */
const OTHER_USER_KEY: WorkspaceKey = { ...KEY, userId: "user-2" };
const NAMES = workspaceNames(INSTANCE, workspaceId(INSTANCE, KEY));
const CONTAINER_ID = "container-t198";
const EXEC_ID = "exec-t198";
/** The cleanup's exec, told apart from the check's own exec by its id. */
const CLEANUP_EXEC_ID = "cleanup-exec-t198";
/** A fake value with no real key's prefix; the runtime holds it as a configured service would. */
const FAKE_KEY = "t198-fake-agent-key-not-real";
/**
 * Real wait before every absence or not-settled assertion: a form that went on to the next call has sent it across
 * the socket by then.
 */
const IO_BARRIER_MS = 100;
/**
 * Real bound of a read that expects a settled value: with real timers the first cleanup poll comes 250 ms after the
 * start, so the 100 ms barrier would read "unsettled" on correct code. Under a fake clock the longer bound changes
 * nothing, because the clock stands still during the real wait.
 */
const SETTLED_BARRIER_MS = 1_000;
/** How long the daemon waits for its socket to close after the client should have destroyed it. */
const CLOSE_BOUND_MS = 1_000;
/** The pause between the marker and the end the double cases cause, so the marker is read first. */
const MARKER_READ_MS = 10;
/** The per-case bound of the attach-double cases with a whole input: each settles in milliseconds. */
const DOUBLE_CASE_TIMEOUT_MS = 2_000;
const FIXTURE_TIME = "2026-11-17T00:00:00Z";
const STDOUT = 1;
const TYPE_THREE = 3;

const CHECKS_TAR = Buffer.alloc(10_240, 7);
const SPEC: CheckStartSpec = { key: KEY, checksTar: CHECKS_TAR, run: "true", slot: 0 };

type Route =
  | "container-inspect"
  | "volume-inspect"
  | "archive-put"
  | "exec-create"
  | "exec-start"
  | "exec-inspect"
  | "cleanup-create"
  | "cleanup-start"
  | "cleanup-inspect"
  | "container-by-id";

type CleanupInspect = { Running: boolean; ExitCode: number | null };

interface Held {
  /** Settles once the held request arrived and was recorded. */
  arrived: Promise<void>;
  /** Sends the answer, computed from the daemon's state at this moment. */
  release(): void;
}

interface Attach {
  /** The daemon's end of the upgraded socket. */
  server: Socket;
  /** Settles with the bytes after the upgrade once the client half-closes. */
  stdin: Promise<Buffer>;
  /** The server socket's `end`, `close` and `error:<code>` events from the upgrade on, in order. */
  events: string[];
}

interface CheckDaemon {
  socketPath: string;
  /** Status of the container inspect; 200 answers with the container below. */
  containerStatus: number;
  containerRunning: boolean;
  containerLabels: Labels;
  volumeLabels: Labels;
  /** A status set for a route is its answer, with an error body. */
  status: Map<Route, number>;
  execInspect: CleanupInspect;
  /** The cleanup's exec inspect answers in order; the last one repeats. */
  cleanupInspect: CleanupInspect[];
  /** A request of a route in it is recorded, then its socket is destroyed with no answer. */
  drop: Set<Route>;
  /** Holds the answer to the next request of the route until `release`. */
  hold(route: Route): Held;
  /** Settles at the route's first arrival, at once when it already arrived. */
  arrived(route: Route): Promise<void>;
  /** Raw request bodies per route, in arrival order. */
  bodies: Map<Route, string[]>;
  count(route: Route): number;
  attach: Promise<Attach>;
}

let server: Server | undefined;
let directory: string | undefined;
const sockets = new Set<Socket>();

afterEach(async () => {
  vi.useRealTimers();
  for (const socket of sockets) socket.destroy();
  sockets.clear();
  const open = server;
  server = undefined;
  if (open !== undefined) await new Promise<void>((resolve) => open.close(() => resolve()));
  if (directory !== undefined) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});

function routeOf(method: string, path: string): Route | null {
  if (method === "GET" && path.endsWith(`/containers/${NAMES.container}/json`)) {
    return "container-inspect";
  }
  if (method === "GET" && path.endsWith(`/volumes/${NAMES.volume}`)) return "volume-inspect";
  if (method === "PUT" && path.endsWith(`/containers/${CONTAINER_ID}/archive`))
    return "archive-put";
  if (method === "POST" && path.endsWith(`/containers/${CONTAINER_ID}/exec`)) return "exec-create";
  if (method === "POST" && path.endsWith(`/exec/${EXEC_ID}/start`)) return "exec-start";
  if (method === "GET" && path.endsWith(`/exec/${EXEC_ID}/json`)) return "exec-inspect";
  if (method === "POST" && path.endsWith(`/exec/${CLEANUP_EXEC_ID}/start`)) return "cleanup-start";
  if (method === "GET" && path.endsWith(`/exec/${CLEANUP_EXEC_ID}/json`)) return "cleanup-inspect";
  if (method === "GET" && path.endsWith(`/containers/${CONTAINER_ID}/json`)) {
    return "container-by-id";
  }
  return null;
}

/** Both execs are created on the same path; the cleanup's body names its script as `$0`. */
function refinedRoute(route: Route, body: string): Route {
  if (route !== "exec-create") return route;
  const parsed: unknown = JSON.parse(body);
  const isCleanup =
    typeof parsed === "object" &&
    parsed !== null &&
    "Cmd" in parsed &&
    Array.isArray(parsed.Cmd) &&
    parsed.Cmd[3] === "academy-cleanup";
  return isCleanup ? "cleanup-create" : route;
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

function answerRequest(daemon: CheckDaemon, route: Route, response: ServerResponse): void {
  const status = daemon.status.get(route);
  if (status !== undefined) {
    json(response, status, { message: "refused by the fake daemon" });
    return;
  }
  if (route === "container-inspect" || route === "container-by-id") {
    if (daemon.containerStatus !== 200) {
      json(response, daemon.containerStatus, { message: "inspect refused" });
      return;
    }
    json(response, 200, {
      Id: CONTAINER_ID,
      Name: `/${NAMES.container}`,
      State: {
        Status: daemon.containerRunning ? "running" : "exited",
        Running: daemon.containerRunning,
        StartedAt: FIXTURE_TIME,
        ExitCode: 0,
        OOMKilled: false,
      },
      Config: { Image: "academy-workspace:fixture", Labels: daemon.containerLabels },
      HostConfig: { Memory: 0, MemorySwap: 0 },
    });
  } else if (route === "volume-inspect") {
    json(response, 200, {
      Name: NAMES.volume,
      Labels: daemon.volumeLabels,
      CreatedAt: FIXTURE_TIME,
    });
  } else if (route === "archive-put") {
    response.statusCode = 200;
    response.end();
  } else if (route === "exec-create") {
    json(response, 201, { Id: EXEC_ID });
  } else if (route === "cleanup-create") {
    json(response, 201, { Id: CLEANUP_EXEC_ID });
  } else if (route === "cleanup-start") {
    response.statusCode = 200;
    response.end();
  } else if (route === "cleanup-inspect") {
    const answer = daemon.cleanupInspect[0];
    if (daemon.cleanupInspect.length > 1) daemon.cleanupInspect.shift();
    json(response, 200, answer);
  } else {
    json(response, 200, daemon.execInspect);
  }
}

async function startDaemon(): Promise<CheckDaemon> {
  directory = await mkdtemp(join(tmpdir(), "wks-check-"));
  const counts = new Map<Route, number>();
  const arrivals = new Map<Route, { promise: Promise<void>; resolve: () => void }>();
  const holds = new Map<Route, { arrive: () => void; released: Promise<void> }>();
  const arrival = (route: Route): { promise: Promise<void>; resolve: () => void } => {
    let entry = arrivals.get(route);
    if (entry === undefined) {
      let resolve = (): void => undefined;
      const promise = new Promise<void>((settle) => {
        resolve = settle;
      });
      entry = { promise, resolve };
      arrivals.set(route, entry);
    }
    return entry;
  };
  let attachReady: (attach: Attach) => void = () => undefined;
  const daemon: CheckDaemon = {
    socketPath: join(directory, "docker.sock"),
    containerStatus: 200,
    containerRunning: true,
    containerLabels: workspaceLabels(INSTANCE, KEY, "container"),
    volumeLabels: workspaceLabels(INSTANCE, KEY, "volume"),
    status: new Map(),
    execInspect: { Running: false, ExitCode: 0 },
    cleanupInspect: [{ Running: false, ExitCode: 0 }],
    drop: new Set(),
    hold: (route) => {
      let arrive = (): void => undefined;
      const arrived = new Promise<void>((resolve) => {
        arrive = resolve;
      });
      let release = (): void => undefined;
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      holds.set(route, { arrive, released });
      return { arrived, release };
    },
    arrived: (route) => arrival(route).promise,
    bodies: new Map(),
    count: (route) => counts.get(route) ?? 0,
    attach: new Promise((resolve) => {
      attachReady = resolve;
    }),
  };
  const record = (route: Route, body: string): void => {
    counts.set(route, (counts.get(route) ?? 0) + 1);
    daemon.bodies.set(route, [...(daemon.bodies.get(route) ?? []), body]);
    arrival(route).resolve();
  };
  const http = createServer((request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const path = new URL(request.url ?? "/", "http://daemon").pathname;
      const matched = routeOf(request.method ?? "", path);
      if (matched === null) {
        json(response, 404, { message: "not found" });
        return;
      }
      const body = Buffer.concat(chunks).toString("utf8");
      const route = refinedRoute(matched, body);
      record(route, body);
      if (daemon.drop.has(route)) {
        request.socket.destroy();
        return;
      }
      const held = holds.get(route);
      if (held === undefined) {
        answerRequest(daemon, route, response);
        return;
      }
      holds.delete(route);
      held.arrive();
      void held.released.then(() => answerRequest(daemon, route, response));
    });
  });
  http.on("connection", (socket: Socket) => sockets.add(socket));
  http.on("upgrade", (request: IncomingMessage, socket: Socket, head: Buffer) => {
    const events: string[] = [];
    socket.on("end", () => events.push("end"));
    socket.on("close", () => events.push("close"));
    // A write to a client that destroyed its socket fails with EPIPE; recorded, never thrown.
    socket.on("error", (error: NodeJS.ErrnoException) => events.push(`error:${error.code ?? "?"}`));
    const length = Number(request.headers["content-length"] ?? "0");
    let received = head;
    let isBodyRead = false;
    const stdinChunks: Buffer[] = [];
    let resolveStdin: (bytes: Buffer) => void = () => undefined;
    const stdin = new Promise<Buffer>((resolve) => {
      resolveStdin = resolve;
    });
    const onBody = (): void => {
      isBodyRead = true;
      record("exec-start", received.subarray(0, length).toString("utf8"));
      stdinChunks.push(received.subarray(length));
      const status = daemon.status.get("exec-start");
      if (status !== undefined) {
        const body = JSON.stringify({ message: "start refused" });
        socket.end(
          `HTTP/1.1 ${status} Refused\r\nContent-Type: application/json\r\n` +
            `Content-Length: ${body.length}\r\n\r\n${body}`,
        );
        return;
      }
      socket.write(
        "HTTP/1.1 101 UPGRADED\r\nContent-Type: application/vnd.docker.raw-stream\r\n" +
          "Connection: Upgrade\r\nUpgrade: tcp\r\n\r\n",
      );
      attachReady({ server: socket, stdin, events });
    };
    socket.on("data", (chunk: Buffer) => {
      if (isBodyRead) {
        stdinChunks.push(chunk);
        return;
      }
      received = Buffer.concat([received, chunk]);
      if (received.length >= length) onBody();
    });
    socket.on("end", () => resolveStdin(Buffer.concat(stdinChunks)));
    if (received.length >= length) onBody();
  });
  server = http;
  await new Promise<void>((resolve) => http.listen(daemon.socketPath, resolve));
  return daemon;
}

/** Every runtime here holds an agent key, the state the no-Env rule exists for. */
function runtimeOn(engine: DockerEngine): DockerRuntime {
  return new DockerRuntime({
    engine,
    instance: INSTANCE,
    courseRoot: "/nonexistent-course-root",
    limits: { nanoCpus: 1_000_000_000, memoryBytes: 256 * 1024 ** 2, pidsLimit: 64 },
    agentApiKey: FAKE_KEY,
    now: () => new Date(0),
  });
}

async function rejectionOf(daemon: CheckDaemon): Promise<unknown> {
  const runtime = runtimeOn(new DockerEngine({ socketPath: daemon.socketPath }));
  return runtime.startCheck(SPEC).then(
    () => null,
    (error: unknown) => error,
  );
}

function frame(type: number, payload: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt8(type, 0);
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

/** A missing settle becomes a value, so the assertion names it instead of the test timing out. */
async function raceBarrier<T>(pending: Promise<T>, ms: number): Promise<T | "unsettled"> {
  return Promise.race([pending, sleep(ms).then(() => "unsettled" as const)]);
}

interface AttachDouble {
  stream: Duplex;
  /** Settles on the client's half-close: the checks tar has been written whole. */
  halfClosed: Promise<void>;
  written(): Buffer;
}

function attachDouble(): AttachDouble {
  const chunks: Buffer[] = [];
  let resolveHalfClosed = (): void => undefined;
  const halfClosed = new Promise<void>((resolve) => {
    resolveHalfClosed = resolve;
  });
  const stream = new Duplex({
    read() {
      // The test feeds the read side with push.
    },
    write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
      chunks.push(chunk);
      callback();
    },
    final(callback: (error?: Error | null) => void) {
      resolveHalfClosed();
      callback();
    },
  });
  return { stream, halfClosed, written: () => Buffer.concat(chunks) };
}

/** Every call goes to the fake daemon except the attached start, which resolves with the double. */
class DoubleEngine extends DockerEngine {
  readonly #double: AttachDouble;

  constructor(socketPath: string, double: AttachDouble) {
    super({ socketPath });
    this.#double = double;
  }

  override async startAttachedExec(_execId: string): Promise<Duplex> {
    return this.#double.stream;
  }
}

/** Pushes each chunk, then the end; stops when the reader has destroyed the stream (a framing error does). */
function pushThenEnd(stream: Duplex, chunks: Buffer[]): void {
  for (const chunk of chunks) {
    if (stream.destroyed) return;
    stream.push(chunk);
  }
  if (!stream.destroyed) stream.push(null);
}

describe("startCheck stages and the exec it sends (U-runtime-check)", () => {
  it("a 409 at exec create is container-not-running", async () => {
    const daemon = await startDaemon();
    daemon.status.set("exec-create", 409);

    const rejection = await rejectionOf(daemon);

    expect(rejection).toBeInstanceOf(CheckNotStartedError);
    expect(rejection).toMatchObject({ stage: "container-not-running", reason: "exec-create" });
  });

  it("a 500 at exec create is exec-create", async () => {
    const daemon = await startDaemon();
    daemon.status.set("exec-create", 500);

    const rejection = await rejectionOf(daemon);

    expect(rejection).toBeInstanceOf(CheckNotStartedError);
    expect(rejection).toMatchObject({ stage: "exec-create", reason: "exec-create" });
  });

  it("a start failure is exec-start", async () => {
    const daemon = await startDaemon();
    daemon.status.set("exec-start", 500);

    const rejection = await rejectionOf(daemon);

    expect(rejection).toBeInstanceOf(CheckNotStartedError);
    expect(rejection).toMatchObject({ stage: "exec-start", reason: "exec-start" });
  });

  it("startCheck writes exactly the given checks tar to the exec stdin", async () => {
    const daemon = await startDaemon();
    const runtime = runtimeOn(new DockerEngine({ socketPath: daemon.socketPath }));

    await runtime.startCheck(SPEC);
    const attach = await daemon.attach;
    const stdin = await attach.stdin;

    expect(stdin.equals(CHECKS_TAR)).toBe(true);
  });

  it("a runtime with an agent key sends no Env in the check exec body", async () => {
    const daemon = await startDaemon();
    const runtime = runtimeOn(new DockerEngine({ socketPath: daemon.socketPath }));

    await runtime.startCheck(SPEC);
    const raw = daemon.bodies.get("exec-create")?.[0] ?? "";

    expect(Object.keys(JSON.parse(raw))).not.toContain("Env");
    expect(raw).not.toContain(FAKE_KEY);
  });
});

describe("the end of a started check's attach stream (U-runtime-check)", () => {
  it("a framing error after the marker resolves ended with framing", async () => {
    const daemon = await startDaemon();
    const runtime = runtimeOn(new DockerEngine({ socketPath: daemon.socketPath }));
    const check = await runtime.startCheck(SPEC);
    const attach = await daemon.attach;
    await attach.stdin;

    attach.server.write(frame(STDOUT, CHECK_MARKER));
    attach.server.write(Buffer.from([TYPE_THREE, 0, 0, 0, 0, 0, 0, 0]));

    expect(await check.setup).toStrictEqual({ kind: "started" });
    expect(await check.ended).toBe("framing");
  });

  // The server's `end` came from the client's half-close after the checks tar, so it cannot tell a destroyed client
  // from an open one. A write after the barrier can: only a destroyed client makes it fail and the server close.
  it("a framing error closes the attach socket", async () => {
    const daemon = await startDaemon();
    const runtime = runtimeOn(new DockerEngine({ socketPath: daemon.socketPath }));
    const check = await runtime.startCheck(SPEC);
    const attach = await daemon.attach;
    await attach.stdin;
    attach.server.write(frame(STDOUT, CHECK_MARKER));
    attach.server.write(Buffer.from([TYPE_THREE, 0, 0, 0, 0, 0, 0, 0]));
    await check.ended;
    await sleep(IO_BARRIER_MS);

    attach.events.push("before-send");
    const closed = new Promise<void>((resolve) => attach.server.once("close", () => resolve()));
    attach.server.write(frame(STDOUT, Buffer.from("after\n")));
    await raceBarrier(closed, CLOSE_BOUND_MS);

    expect(attach.events).toContain("close");
  });

  it("a socket error resolves ended with socket-error", async () => {
    const daemon = await startDaemon();
    const double = attachDouble();
    const runtime = runtimeOn(new DoubleEngine(daemon.socketPath, double));
    const check = await runtime.startCheck(SPEC);
    await double.halfClosed;

    double.stream.push(frame(STDOUT, CHECK_MARKER));
    await sleep(MARKER_READ_MS);
    double.stream.destroy(new Error("attach stream destroyed by the test"));

    expect(await check.setup).toStrictEqual({ kind: "started" });
    expect(await check.ended).toBe("socket-error");
  });
});

describe("startCheck refuses a container it must not exec in (RC10-RC13)", () => {
  it.each<[string, (daemon: CheckDaemon) => void]>([
    [
      "a missing container",
      (daemon) => {
        daemon.containerStatus = 404;
      },
    ],
    [
      "a stopped container",
      (daemon) => {
        daemon.containerRunning = false;
      },
    ],
  ])("%s is container-not-running with no exec created", async (_input, arrange) => {
    const daemon = await startDaemon();
    arrange(daemon);

    const rejection = await rejectionOf(daemon);
    await sleep(IO_BARRIER_MS);

    expect(rejection).toBeInstanceOf(CheckNotStartedError);
    expect(rejection).toMatchObject({ stage: "container-not-running" });
    expect(daemon.count("archive-put")).toBe(0);
    expect(daemon.count("exec-create")).toBe(0);
  });

  // Each object carries every label workspaceLabels writes for this instance, so it is managed, of this instance and
  // parses as valid; only the user id differs from the key. Only the key comparison of labelsMatchKey refuses it,
  // which is what keeps startCheck out of another user's container of this instance.
  it.each<
    [string, (daemon: CheckDaemon) => void, (rejection: unknown, daemon: CheckDaemon) => void]
  >([
    [
      "a container whose labels name another user",
      (daemon) => {
        daemon.containerLabels = workspaceLabels(INSTANCE, OTHER_USER_KEY, "container");
      },
      (rejection, daemon) => {
        expect(rejection).toMatchObject({
          stage: "exec-create",
          cause: { objectName: NAMES.container },
        });
        expect(rejection).toHaveProperty("cause", expect.any(WorkspaceIdentityMismatchError));
        expect(daemon.count("container-inspect")).toBe(1);
      },
    ],
    [
      "a volume whose labels name another user",
      (daemon) => {
        daemon.volumeLabels = workspaceLabels(INSTANCE, OTHER_USER_KEY, "volume");
      },
      (rejection, daemon) => {
        expect(rejection).toMatchObject({
          stage: "exec-create",
          cause: { objectName: NAMES.volume },
        });
        expect(rejection).toHaveProperty("cause", expect.any(WorkspaceIdentityMismatchError));
        expect(daemon.count("volume-inspect")).toBe(1);
      },
    ],
    [
      "a container inspect answered 500",
      (daemon) => {
        daemon.containerStatus = 500;
      },
      () => undefined,
    ],
  ])("%s is exec-create with no exec created", async (_input, arrange, assertCause) => {
    const daemon = await startDaemon();
    arrange(daemon);

    const rejection = await rejectionOf(daemon);
    await sleep(IO_BARRIER_MS);

    expect(rejection).toBeInstanceOf(CheckNotStartedError);
    expect(rejection).toMatchObject({ stage: "exec-create" });
    assertCause(rejection, daemon);
    expect(daemon.count("archive-put")).toBe(0);
    expect(daemon.count("exec-create")).toBe(0);
  });

  it("a container and a volume with the labels of the key pass the label check", async () => {
    const daemon = await startDaemon();
    const runtime = runtimeOn(new DockerEngine({ socketPath: daemon.socketPath }));

    await runtime.startCheck(SPEC);

    expect(daemon.count("archive-put")).toBe(1);
    expect(daemon.count("exec-create")).toBe(1);
  });

  it.each([404, 409])("an archive put answered %i is container-not-running", async (status) => {
    const daemon = await startDaemon();
    daemon.status.set("archive-put", status);

    const rejection = await rejectionOf(daemon);
    await sleep(IO_BARRIER_MS);

    expect(rejection).toBeInstanceOf(CheckNotStartedError);
    expect(rejection).toMatchObject({ stage: "container-not-running", reason: "archive" });
    expect(daemon.count("exec-create")).toBe(0);
  });

  it("an archive put answered 500 is exec-create", async () => {
    const daemon = await startDaemon();
    daemon.status.set("archive-put", 500);

    const rejection = await rejectionOf(daemon);
    await sleep(IO_BARRIER_MS);

    expect(rejection).toBeInstanceOf(CheckNotStartedError);
    expect(rejection).toMatchObject({ stage: "exec-create", reason: "archive" });
    expect(daemon.count("exec-create")).toBe(0);
  });
});

/** Docker's own text where the marker should be, as when the process could not start. */
const DOCKER_TEXT = Buffer.from(
  "OCI runtime exec failed: exec failed: unable to start container process",
  "utf8",
).subarray(0, 30);
const MARKER_PREFIX_BYTES = 10;

describe("setup outcomes of a check that never printed the marker (RC14)", () => {
  it.each<[string, string, string, (double: AttachDouble) => void]>([
    [
      "marker-mismatch for Docker text in place of the marker",
      "marker-mismatch",
      "eof",
      (double) => pushThenEnd(double.stream, [frame(STDOUT, DOCKER_TEXT)]),
    ],
    [
      "ended-before-marker for a stream that ends before the marker",
      "ended-before-marker",
      "eof",
      (double) =>
        pushThenEnd(double.stream, [frame(STDOUT, CHECK_MARKER.subarray(0, MARKER_PREFIX_BYTES))]),
    ],
    [
      "framing for a type-3 header before the marker",
      "framing",
      "framing",
      (double) => pushThenEnd(double.stream, [frame(TYPE_THREE, Buffer.alloc(0))]),
    ],
    [
      "socket-error for a socket error before the marker",
      "socket-error",
      "socket-error",
      (double) => double.stream.destroy(new Error("attach stream destroyed by the test")),
    ],
  ])(
    "setup reports %s",
    async (_input, reason, end, feed) => {
      const daemon = await startDaemon();
      const double = attachDouble();
      const runtime = runtimeOn(new DoubleEngine(daemon.socketPath, double));
      const check = await runtime.startCheck(SPEC);
      await double.halfClosed;
      expect(double.written().equals(CHECKS_TAR)).toBe(true);

      feed(double);

      expect(await check.setup).toStrictEqual({ kind: "not-started", reason });
      expect(await check.ended).toBe(end);
      expect(check.stdout().text).toBe("");
      expect(double.stream.destroyed).toBe(true);
    },
    DOUBLE_CASE_TIMEOUT_MS,
  );
});

describe("exit status and a bare close (RC15, RC16)", () => {
  it("an exit status with no exit code after the end rejects with a response shape error", async () => {
    const daemon = await startDaemon();
    daemon.execInspect = { Running: false, ExitCode: null };
    const runtime = runtimeOn(new DockerEngine({ socketPath: daemon.socketPath }));
    const check = await runtime.startCheck(SPEC);
    const attach = await daemon.attach;
    await attach.stdin;

    attach.server.end(frame(STDOUT, CHECK_MARKER));
    expect(await check.ended).toBe("eof");
    const status = check.exitStatus();

    await expect(status).rejects.toBeInstanceOf(DockerResponseShapeError);
    await expect(status).rejects.toMatchObject({
      operation: "inspect exec",
      issuePath: "ExitCode",
    });
  });

  it("a close with no end and no error resolves ended with socket-error", async () => {
    const daemon = await startDaemon();
    const double = attachDouble();
    const runtime = runtimeOn(new DoubleEngine(daemon.socketPath, double));
    const check = await runtime.startCheck(SPEC);
    await double.halfClosed;

    double.stream.push(frame(STDOUT, CHECK_MARKER));
    await sleep(MARKER_READ_MS);
    double.stream.destroy();

    expect(await raceBarrier(check.ended, IO_BARRIER_MS)).toBe("socket-error");
    expect(await check.setup).toStrictEqual({ kind: "started" });
  });
});

// Captured at module evaluation, before any test installs fake timers, so the barriers below wait real time whatever
// the fake clock fakes.
const realSetTimeout = globalThis.setTimeout;

function realSleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    realSetTimeout(resolve, ms);
  });
}

async function raceRealBarrier<T>(pending: Promise<T>, ms: number): Promise<T | "unsettled"> {
  return Promise.race([pending, realSleep(ms).then(() => "unsettled" as const)]);
}

function settled<T>(pending: Promise<T>): Promise<T | "unsettled"> {
  return raceRealBarrier(pending, SETTLED_BARRIER_MS);
}

function pendingRead<T>(pending: Promise<T>): Promise<T | "unsettled"> {
  return raceRealBarrier(pending, IO_BARRIER_MS);
}

/** Only the four timer globals: the daemon's server and the attach were set up on real timers before this. */
function useCleanupClock(): void {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
}

/**
 * Advances the fake clock, then waits real time while it stands still: a request a fired timer sent reaches the
 * daemon and its answer is read, and any timer that answer schedules waits for the next settle. Without the real
 * wait an absence read right after the advance sees nothing yet.
 */
async function settleWithClock(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  await realSleep(IO_BARRIER_MS);
}

/** The start's answer has been read, so the cap and the first poll are registered on the fake clock. */
async function afterStartAnswered(daemon: CheckDaemon): Promise<void> {
  await daemon.arrived("cleanup-start");
  await realSleep(IO_BARRIER_MS);
}

async function startedCheck(
  daemon: CheckDaemon,
  engine: DockerEngine = new DockerEngine({ socketPath: daemon.socketPath }),
): Promise<CheckProcess> {
  const check = await runtimeOn(engine).startCheck(SPEC);
  await (await daemon.attach).stdin;
  return check;
}

function cleanupResult(
  kind: CleanupResult["kind"],
  exitCode: number | null,
  httpStatus: number | null,
): CleanupResult {
  return { kind, exitCode, httpStatus };
}

type CleanupCall = "create" | "start" | "inspect";

/** Rejects one cleanup call with a status-0 `DockerApiError`; the check's own calls go to the fake daemon. */
class StatusZeroEngine extends DockerEngine {
  readonly #member: CleanupCall;
  /** Exec inspects of the cleanup's exec, failing or not. */
  inspectCalls = 0;

  constructor(socketPath: string, member: CleanupCall) {
    super({ socketPath });
    this.#member = member;
  }

  override async createExec(
    containerId: string,
    body: Parameters<DockerEngine["createExec"]>[1],
  ): Promise<string> {
    if (this.#member === "create" && body.Cmd[3] === "academy-cleanup") {
      throw new DockerApiError("create exec", 0);
    }
    return super.createExec(containerId, body);
  }

  override async startDetachedExec(execId: string): Promise<void> {
    if (this.#member === "start") throw new DockerApiError("start detached exec", 0);
    return super.startDetachedExec(execId);
  }

  override async inspectExec(execId: string): Promise<ExecInspect> {
    if (execId === CLEANUP_EXEC_ID) {
      this.inspectCalls += 1;
      if (this.#member === "inspect") throw new DockerApiError("inspect exec", 0);
    }
    return super.inspectExec(execId);
  }
}

/** T9 and T10: past the cap while the call is held, then the normal end once it is answered. */
async function expectHeldCallKeepsTerminatePending(
  route: Route,
  heldMessage: string,
  resultMessage: string,
): Promise<void> {
  const daemon = await startDaemon();
  const held = daemon.hold(route);
  const check = await startedCheck(daemon);
  useCleanupClock();

  const result = check.terminate({ wait: true });
  await held.arrived;
  await settleWithClock(30_250);
  expect(await pendingRead(result), heldMessage).toBe("unsettled");
  held.release();
  await afterStartAnswered(daemon);
  await settleWithClock(250);

  expect(await settled(result), resultMessage).toStrictEqual(cleanupResult("clean", 0, null));
}

describe("terminate maps the cleanup exec's end (U-runtime-check)", () => {
  it.each<[number, CleanupResult["kind"]]>([
    [0, "clean"],
    [4, "processes-left"],
    [5, "files-left"],
    [7, "processes-and-files-left"],
    [6, "no-proc"],
    [128, "not-started"],
    [137, "killed"],
    [200, "unexpected-exit"],
  ])("T1: terminate maps cleanup exit %i to %s", async (code, kind) => {
    const daemon = await startDaemon();
    daemon.cleanupInspect = [{ Running: false, ExitCode: code }];
    const check = await startedCheck(daemon);
    useCleanupClock();

    const result = check.terminate({ wait: true });
    await afterStartAnswered(daemon);
    await settleWithClock(250);

    expect(await settled(result), "T1 result").toStrictEqual(cleanupResult(kind, code, null));
  });

  it("T2: exit 128 is not-started", async () => {
    const daemon = await startDaemon();
    daemon.cleanupInspect = [{ Running: false, ExitCode: 128 }];
    const check = await startedCheck(daemon);
    useCleanupClock();

    const result = check.terminate({ wait: true });
    await afterStartAnswered(daemon);
    await settleWithClock(250);

    expect(await settled(result), "exit 128 is not-started").toStrictEqual(
      cleanupResult("not-started", 128, null),
    );
  });

  it.each([126, 127])("T3: exit %i is not-started", async (code) => {
    const daemon = await startDaemon();
    daemon.cleanupInspect = [{ Running: false, ExitCode: code }];
    const check = await startedCheck(daemon);
    useCleanupClock();

    const result = check.terminate({ wait: true });
    await afterStartAnswered(daemon);
    await settleWithClock(250);

    expect(await settled(result), "T3 not-started").toStrictEqual(
      cleanupResult("not-started", code, null),
    );
  });

  it("T4: a create answered 409 is container-stopped with httpStatus 409", async () => {
    const daemon = await startDaemon();
    daemon.status.set("cleanup-create", 409);
    const check = await startedCheck(daemon);

    const result = check.terminate({ wait: true });

    expect(await settled(result), "T4 result").toStrictEqual(
      cleanupResult("container-stopped", null, 409),
    );
  });

  it("T5: an exec inspect answered 404 is container-stopped with httpStatus 404", async () => {
    const daemon = await startDaemon();
    daemon.status.set("cleanup-inspect", 404);
    const check = await startedCheck(daemon);
    useCleanupClock();

    const result = check.terminate({ wait: true });
    await afterStartAnswered(daemon);
    await settleWithClock(250);

    expect(await settled(result), "T5 result").toStrictEqual(
      cleanupResult("container-stopped", null, 404),
    );
  });

  it("T6: a start answered 500 is not-started with httpStatus 500 and no exit code", async () => {
    const daemon = await startDaemon();
    daemon.status.set("cleanup-start", 500);
    const check = await startedCheck(daemon);

    const result = check.terminate({ wait: true });

    expect(await settled(result), "T6 result").toStrictEqual(
      cleanupResult("not-started", null, 500),
    );
  });

  it("T7: terminate resolves timed-out 30 s after the start answered, with neither field", async () => {
    const daemon = await startDaemon();
    daemon.cleanupInspect = [{ Running: true, ExitCode: null }];
    const check = await startedCheck(daemon);
    useCleanupClock();

    const result = check.terminate({ wait: true });
    await afterStartAnswered(daemon);
    await settleWithClock(29_999);
    expect(await pendingRead(result), "T7 unsettled at 29,999 ms").toBe("unsettled");
    await settleWithClock(1);

    expect(await settled(result), "T7 result").toStrictEqual(
      cleanupResult("timed-out", null, null),
    );
  });

  it("T8: terminate called twice creates one cleanup exec", async () => {
    const daemon = await startDaemon();
    const check = await startedCheck(daemon);
    useCleanupClock();

    const first = check.terminate({ wait: true });
    const second = check.terminate({ wait: false });
    expect(second, "T8 same promise").toBe(first);
    await afterStartAnswered(daemon);
    await settleWithClock(250);

    expect(await settled(first), "T8 result").toStrictEqual(cleanupResult("clean", 0, null));
    await realSleep(IO_BARRIER_MS);
    expect(daemon.count("cleanup-create"), "T8 one cleanup create").toBe(1);
  });

  it("T9: terminate does not resolve while its start call is pending", async () => {
    await expectHeldCallKeepsTerminatePending(
      "cleanup-start",
      "unsettled while the start is held",
      "T9 result",
    );
  });

  it("T10: terminate does not resolve while its create call is pending", async () => {
    await expectHeldCallKeepsTerminatePending(
      "cleanup-create",
      "unsettled while the create is held",
      "T10 result",
    );
  });

  it("T11: terminate destroys the attach socket before the cleanup create answers", async () => {
    const daemon = await startDaemon();
    const held = daemon.hold("cleanup-create");
    const check = await startedCheck(daemon);

    const result = check.terminate({ wait: true });
    await held.arrived;
    expect(await settled(check.ended), "T11 socket-error before the create answers").toBe(
      "socket-error",
    );
    held.release();

    expect(await settled(result), "T11 clean").toStrictEqual(cleanupResult("clean", 0, null));
  });

  it("T12: the terminate poll keeps no timer referenced", async () => {
    const daemon = await startDaemon();
    daemon.cleanupInspect = [{ Running: true, ExitCode: null }];
    const check = await startedCheck(daemon);
    useCleanupClock();
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    const result = check.terminate({ wait: true });
    await afterStartAnswered(daemon);
    await settleWithClock(250);
    await settleWithClock(250);
    await settleWithClock(250);
    // Only the cap and the polls: any other timer with another delay is not terminate's.
    const terminateTimers = setTimeoutSpy.mock.calls.flatMap((call, index) => {
      const delay = call[1];
      const handle = setTimeoutSpy.mock.results[index]?.value;
      const isTerminateDelay = delay === CHECK_CLEANUP_TIMEOUT_MS || delay === CLEANUP_POLL_MS;
      return isTerminateDelay ? [{ delay, handle }] : [];
    });
    // Restored while the fake clock is installed, so afterEach's useRealTimers puts back the real one.
    setTimeoutSpy.mockRestore();

    const caps = terminateTimers.filter((timer) => timer.delay === CHECK_CLEANUP_TIMEOUT_MS);
    const polls = terminateTimers.filter((timer) => timer.delay === CLEANUP_POLL_MS);
    expect(caps, "T12 one cap timer").toHaveLength(1);
    expect(polls.length, "T12 at least 3 polls").toBeGreaterThanOrEqual(3);
    expect(
      terminateTimers.every((timer) => timer.handle?.hasRef() === false),
      "every terminate timer is unref'd",
    ).toBe(true);
    await settleWithClock(30_000);
    expect(await settled(result), "T12 result").toStrictEqual(
      cleanupResult("timed-out", null, null),
    );
  });

  it("T13: a runtime with an agent key sends no Env in the cleanup exec body", async () => {
    const daemon = await startDaemon();
    const check = await startedCheck(daemon);

    await check.terminate({ wait: false });
    const raw = daemon.bodies.get("cleanup-create")?.[0] ?? "";

    expect(Object.keys(JSON.parse(raw)), "T13 no Env key").not.toContain("Env");
    expect(raw, "T13 no key in the body").not.toContain(FAKE_KEY);
  });

  it("T14: isContainerRunning reads a fresh inspect by the container Id taken at start", async () => {
    const daemon = await startDaemon();
    const check = await startedCheck(daemon);

    expect(await check.isContainerRunning(), "T14 running").toBe(true);
    daemon.containerRunning = false;
    expect(await check.isContainerRunning(), "T14 not running").toBe(false);
    expect(daemon.count("container-by-id"), "T14 two inspects by Id").toBe(2);
  });

  it("RC1a: with wait false, terminate resolves cleanup-started only once the start answered", async () => {
    const daemon = await startDaemon();
    const held = daemon.hold("cleanup-start");
    const check = await startedCheck(daemon);

    const result = check.terminate({ wait: false });
    await held.arrived;
    expect(await pendingRead(result), "unsettled while the start is held").toBe("unsettled");
    held.release();

    expect(await settled(result), "cleanup-started after the start").toStrictEqual(
      cleanupResult("cleanup-started", null, null),
    );
  });

  it("RC1b: with wait false, terminate makes no exec inspect", async () => {
    const daemon = await startDaemon();
    const check = await startedCheck(daemon);
    useCleanupClock();

    const result = check.terminate({ wait: false });
    await afterStartAnswered(daemon);
    expect(await settled(result), "RC1b result").toStrictEqual(
      cleanupResult("cleanup-started", null, null),
    );
    await settleWithClock(250);
    await settleWithClock(250);

    expect(daemon.count("cleanup-inspect"), "no cleanup inspect with wait false").toBe(0);
  });

  it("RC2: a create answered 404 is container-stopped with httpStatus 404", async () => {
    const daemon = await startDaemon();
    daemon.status.set("cleanup-create", 404);
    const check = await startedCheck(daemon);

    const result = check.terminate({ wait: true });

    expect(await settled(result), "RC2 result").toStrictEqual(
      cleanupResult("container-stopped", null, 404),
    );
  });

  it.each([404, 409])("RC3: a start answered %i is container-stopped", async (status) => {
    const daemon = await startDaemon();
    daemon.status.set("cleanup-start", status);
    const check = await startedCheck(daemon);

    const result = check.terminate({ wait: true });

    expect(await settled(result), "RC3 result").toStrictEqual(
      cleanupResult("container-stopped", null, status),
    );
  });

  it("RC4: a create answered 500 is docker-error with httpStatus 500", async () => {
    const daemon = await startDaemon();
    daemon.status.set("cleanup-create", 500);
    const check = await startedCheck(daemon);

    const result = check.terminate({ wait: true });

    expect(await settled(result), "RC4 result").toStrictEqual(
      cleanupResult("docker-error", null, 500),
    );
  });

  it("RC5a: the poll stops at the first exit code", async () => {
    const daemon = await startDaemon();
    const check = await startedCheck(daemon);
    useCleanupClock();

    const result = check.terminate({ wait: true });
    await afterStartAnswered(daemon);
    await settleWithClock(250);
    expect(await settled(result), "RC5a result").toStrictEqual(cleanupResult("clean", 0, null));
    await settleWithClock(250);
    await settleWithClock(250);

    expect(daemon.count("cleanup-inspect"), "one cleanup inspect").toBe(1);
  });

  it("RC5b: an exec inspect answered 500 is docker-error with httpStatus 500", async () => {
    const daemon = await startDaemon();
    daemon.status.set("cleanup-inspect", 500);
    const check = await startedCheck(daemon);
    useCleanupClock();

    const result = check.terminate({ wait: true });
    await afterStartAnswered(daemon);
    await settleWithClock(250);

    expect(await settled(result), "RC5b result").toStrictEqual(
      cleanupResult("docker-error", null, 500),
    );
  });

  it("G1: a dropped connection rejects an engine call with DockerUnavailableError", async () => {
    const daemon = await startDaemon();
    daemon.drop.add("cleanup-create");
    const engine = new DockerEngine({ socketPath: daemon.socketPath });

    const failure = await engine.createExec(CONTAINER_ID, checkCleanupExecCreateBody(2000)).then(
      () => null,
      (error: unknown) => error,
    );

    expect(failure, "G1 class").toBeInstanceOf(DockerUnavailableError);
    const errnoCode = failure instanceof DockerUnavailableError ? failure.errnoCode : null;
    expect(errnoCode, "G1 errno").toBe("ECONNRESET");
  });

  it("RC6-create: a dropped create is docker-error with neither field", async () => {
    const daemon = await startDaemon();
    daemon.drop.add("cleanup-create");
    const check = await startedCheck(daemon);

    const result = check.terminate({ wait: true });

    expect(await settled(result), "RC6 result").toStrictEqual(
      cleanupResult("docker-error", null, null),
    );
  });

  it("RC6-start: a dropped start is docker-error with neither field", async () => {
    const daemon = await startDaemon();
    daemon.drop.add("cleanup-start");
    const check = await startedCheck(daemon);

    const result = check.terminate({ wait: true });

    expect(await settled(result), "RC6 result").toStrictEqual(
      cleanupResult("docker-error", null, null),
    );
  });

  it("RC6-inspect: a dropped exec inspect is docker-error with neither field and is not retried", async () => {
    const daemon = await startDaemon();
    daemon.drop.add("cleanup-inspect");
    const check = await startedCheck(daemon);
    useCleanupClock();

    const result = check.terminate({ wait: true });
    await afterStartAnswered(daemon);
    await settleWithClock(250);
    expect(await settled(result), "RC6-inspect result").toStrictEqual(
      cleanupResult("docker-error", null, null),
    );
    await settleWithClock(250);

    expect(daemon.count("cleanup-inspect"), "RC6-inspect one inspect").toBe(1);
  });

  it("RC8: the cap counts from the answer to the start, not from the call", async () => {
    const daemon = await startDaemon();
    daemon.cleanupInspect = [{ Running: true, ExitCode: null }];
    const held = daemon.hold("cleanup-start");
    const check = await startedCheck(daemon);
    useCleanupClock();

    const result = check.terminate({ wait: true });
    await held.arrived;
    await settleWithClock(10_000);
    held.release();
    await afterStartAnswered(daemon);
    await settleWithClock(29_999);
    expect(await pendingRead(result), "unsettled 29,999 ms after the start answered").toBe(
      "unsettled",
    );
    await settleWithClock(1);

    expect(await settled(result), "RC8 result").toStrictEqual(
      cleanupResult("timed-out", null, null),
    );
  });

  it("RC9a: the first exec inspect comes one poll period after the start answered", async () => {
    const daemon = await startDaemon();
    daemon.cleanupInspect = [{ Running: true, ExitCode: null }];
    const check = await startedCheck(daemon);
    useCleanupClock();

    void check.terminate({ wait: true });
    await afterStartAnswered(daemon);
    expect(daemon.count("cleanup-inspect"), "no inspect at the start's answer").toBe(0);
    await settleWithClock(249);
    expect(daemon.count("cleanup-inspect"), "RC9a none at 249").toBe(0);
    await settleWithClock(1);
    expect(daemon.count("cleanup-inspect"), "RC9a one at 250").toBe(1);
    // Lets the cap fire, so no poll of this case outlives it.
    await settleWithClock(30_000);
  });

  it("RC9b: the poll period is 250 ms (the measured RC9c form)", async () => {
    const daemon = await startDaemon();
    daemon.cleanupInspect = [{ Running: true, ExitCode: null }];
    const check = await startedCheck(daemon);
    useCleanupClock();

    void check.terminate({ wait: true });
    await afterStartAnswered(daemon);
    await settleWithClock(100);
    expect(daemon.count("cleanup-inspect"), "no inspect before one period").toBe(0);
    await settleWithClock(150);
    expect(daemon.count("cleanup-inspect"), "one inspect after one period").toBe(1);
    await settleWithClock(30_000);
  });

  const statusZeroRuns: Readonly<
    Record<
      CleanupCall,
      (daemon: CheckDaemon, engine: StatusZeroEngine, check: CheckProcess) => Promise<void>
    >
  > = {
    create: async (daemon, _engine, check) => {
      const result = check.terminate({ wait: true });
      expect(await settled(result), "RC6b-create result").toStrictEqual(
        cleanupResult("docker-error", null, null),
      );
      await realSleep(IO_BARRIER_MS);
      expect(daemon.count("cleanup-start"), "RC6b-create no start").toBe(0);
    },
    start: async (daemon, engine, check) => {
      useCleanupClock();
      const result = check.terminate({ wait: true });
      expect(await settled(result), "RC6b-start result").toStrictEqual(
        cleanupResult("docker-error", null, null),
      );
      await settleWithClock(250);
      expect(daemon.count("cleanup-create"), "RC6b-start one create").toBe(1);
      expect(engine.inspectCalls, "RC6b-start no inspect").toBe(0);
    },
    inspect: async (daemon, engine, check) => {
      useCleanupClock();
      const result = check.terminate({ wait: true });
      await afterStartAnswered(daemon);
      await settleWithClock(250);
      expect(await settled(result), "RC6b-inspect result").toStrictEqual(
        cleanupResult("docker-error", null, null),
      );
      await settleWithClock(250);
      expect(engine.inspectCalls, "RC6b-inspect not retried").toBe(1);
    },
  };

  it.each<CleanupCall>(["create", "start", "inspect"])(
    "RC6b: a status-0 error at the cleanup %s is docker-error with neither field",
    async (member) => {
      const daemon = await startDaemon();
      const engine = new StatusZeroEngine(daemon.socketPath, member);
      const check = await startedCheck(daemon, engine);

      await statusZeroRuns[member](daemon, engine, check);
    },
  );
});
