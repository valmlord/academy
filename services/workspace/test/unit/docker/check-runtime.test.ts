import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Duplex } from "node:stream";
import { setTimeout as sleep } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import { CHECK_MARKER } from "../../../src/docker/demux.js";
import { DockerEngine } from "../../../src/docker/engine.js";
import { DockerRuntime } from "../../../src/docker/runtime.js";
import {
  CheckNotStartedError,
  DockerResponseShapeError,
  WorkspaceIdentityMismatchError,
} from "../../../src/errors.js";
import {
  type Labels,
  type WorkspaceKey,
  workspaceId,
  workspaceLabels,
  workspaceNames,
} from "../../../src/identity.js";
import type { CheckStartSpec } from "../../../src/runtime.js";

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
/** A fake value with no real key's prefix; the runtime holds it as a configured service would. */
const FAKE_KEY = "t198-fake-agent-key-not-real";
/**
 * Real wait before every absence or not-settled assertion: a form that went on to the next call has sent it across
 * the socket by then.
 */
const IO_BARRIER_MS = 100;
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
  | "exec-inspect";

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
  execInspect: { Running: boolean; ExitCode: number | null };
  /** Raw request bodies per route, in arrival order. */
  bodies: Map<Route, string[]>;
  count(route: Route): number;
  attach: Promise<Attach>;
}

let server: Server | undefined;
let directory: string | undefined;
const sockets = new Set<Socket>();

afterEach(async () => {
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
  return null;
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
  if (route === "container-inspect") {
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
  } else {
    json(response, 200, daemon.execInspect);
  }
}

async function startDaemon(): Promise<CheckDaemon> {
  directory = await mkdtemp(join(tmpdir(), "wks-check-"));
  const counts = new Map<Route, number>();
  let attachReady: (attach: Attach) => void = () => undefined;
  const daemon: CheckDaemon = {
    socketPath: join(directory, "docker.sock"),
    containerStatus: 200,
    containerRunning: true,
    containerLabels: workspaceLabels(INSTANCE, KEY, "container"),
    volumeLabels: workspaceLabels(INSTANCE, KEY, "volume"),
    status: new Map(),
    execInspect: { Running: false, ExitCode: 0 },
    bodies: new Map(),
    count: (route) => counts.get(route) ?? 0,
    attach: new Promise((resolve) => {
      attachReady = resolve;
    }),
  };
  const record = (route: Route, body: string): void => {
    counts.set(route, (counts.get(route) ?? 0) + 1);
    daemon.bodies.set(route, [...(daemon.bodies.get(route) ?? []), body]);
  };
  const http = createServer((request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const path = new URL(request.url ?? "/", "http://daemon").pathname;
      const route = routeOf(request.method ?? "", path);
      if (route === null) {
        json(response, 404, { message: "not found" });
        return;
      }
      record(route, Buffer.concat(chunks).toString("utf8"));
      answerRequest(daemon, route, response);
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
