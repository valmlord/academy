import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Duplex } from "node:stream";
import { setTimeout as sleep } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import { DockerEngine } from "../../../src/docker/engine.js";
import {
  detachedExecStartBody,
  execCreateBody,
  execStartBody,
  killExecCreateBody,
} from "../../../src/docker/spec.js";
import { DockerApiError } from "../../../src/errors.js";

// U-exec-body and the engine's exec calls (design 3.2, 3.5, #110) against a fake daemon on a temp unix socket, so the
// bodies are asserted as the daemon receives them and `pnpm test` stays Docker-free.

const EXEC_ID = "exec-1";
const CONTAINER_ID = "container-1";
/** docker-modem's inactivity timeout for these engines: short, so an idle hijacked socket would hit it. */
const TIMEOUT_MS = 200;
/** Idle time after the hijack: more than twice the timeout above. */
const IDLE_MS = 500;
/** A shell's pid-file tag, as the adapter generates it (16 hex characters). */
const TAG = "0123456789abcdef";
const AGENT_KEY = "t115-fake-agent-key-not-real";
/**
 * With 0 docker-modem sets no `req.setTimeout` (modem.js:296 `if (self.timeout)`; engine.ts keeps the 0, dockerode
 * docker.js:34 and modem.js:93 pass it through), so nothing in the client closes an idle socket by itself. Neither
 * `TIMEOUT_MS`, which would close it at 200 ms, nor the 30 s default, so the row does not depend on its value.
 */
const NO_INACTIVITY_TIMEOUT_MS = 0;
/** How long the detached start's socket may stay open before the row fails. */
const RELEASE_BOUND_MS = 2_000;

interface Recorded {
  method: string;
  url: string;
  body: string;
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

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

/** Reads exactly `length` body bytes of an upgrade request: what arrived with the headers, then the socket. */
function readUpgradeBody(socket: Duplex, head: Buffer, length: number): Promise<string> {
  return new Promise((resolve) => {
    let received = head;
    const done = (): boolean => {
      if (received.length < length) return false;
      socket.off("data", onData);
      resolve(received.subarray(0, length).toString("utf8"));
      return true;
    };
    const onData = (chunk: Buffer): void => {
      received = Buffer.concat([received, chunk]);
      done();
    };
    if (!done()) socket.on("data", onData);
  });
}

interface DetachedStart {
  body: string;
  upgrade: string | undefined;
  /** Settles when the request's socket closes; registered on arrival, so a close cannot be missed. */
  closed: Promise<void>;
}

interface FakeDaemon {
  socketPath: string;
  requests: Recorded[];
  /** Plain (not upgraded) exec starts only: the upgrade handler never writes here. */
  detachedStarts: DetachedStart[];
  /** The daemon's end of the hijacked exec socket, once a start was upgraded. */
  shell: Promise<Socket>;
  /** Status the resize route answers. */
  resizeStatus: number;
}

async function fakeDaemon(): Promise<FakeDaemon> {
  directory = await mkdtemp(join(tmpdir(), "wks-exec-"));
  const socketPath = join(directory, "docker.sock");
  let shellReady: (socket: Socket) => void = () => undefined;
  const daemon: FakeDaemon = {
    socketPath,
    requests: [],
    detachedStarts: [],
    shell: new Promise((resolve) => {
      shellReady = resolve;
    }),
    resizeStatus: 200,
  };
  const http = createServer((request: IncomingMessage, response: ServerResponse) => {
    if (request.url === `/v1.44/exec/${EXEC_ID}/start`) {
      const closed = new Promise<void>((resolve) => request.socket.once("close", () => resolve()));
      void readBody(request).then((body) => {
        daemon.detachedStarts.push({ body, upgrade: request.headers.upgrade, closed });
        // Headers only, and the response never ends: only the client can close this socket.
        response.writeHead(200);
        response.flushHeaders();
      });
      return;
    }
    void readBody(request).then((body) => {
      const url = request.url ?? "";
      daemon.requests.push({ method: request.method ?? "", url, body });
      response.setHeader("Content-Type", "application/json");
      if (url === `/v1.44/containers/${CONTAINER_ID}/exec`) {
        response.statusCode = 201;
        response.end(JSON.stringify({ Id: EXEC_ID }));
      } else if (url.startsWith(`/v1.44/exec/${EXEC_ID}/resize`)) {
        response.statusCode = daemon.resizeStatus;
        response.end(
          daemon.resizeStatus === 200 ? "" : JSON.stringify({ message: "no such exec" }),
        );
      } else if (url === `/v1.44/exec/${EXEC_ID}/json`) {
        response.statusCode = 200;
        response.end(
          JSON.stringify({ Running: false, ExitCode: 3, ProcessConfig: { user: "1000" } }),
        );
      } else {
        response.statusCode = 404;
        response.end(JSON.stringify({ message: "not found" }));
      }
    });
  });
  http.on("connection", (socket: Socket) => sockets.add(socket));
  http.on("upgrade", (request: IncomingMessage, socket: Socket, head: Buffer) => {
    const length = Number(request.headers["content-length"] ?? "0");
    void readUpgradeBody(socket, head, length).then((body) => {
      daemon.requests.push({ method: request.method ?? "", url: request.url ?? "", body });
      socket.write(
        "HTTP/1.1 101 UPGRADED\r\nContent-Type: application/vnd.docker.raw-stream\r\n" +
          "Connection: Upgrade\r\nUpgrade: tcp\r\n\r\n",
      );
      shellReady(socket);
    });
  });
  server = http;
  await new Promise<void>((resolve) => http.listen(socketPath, resolve));
  return daemon;
}

function nextData(stream: Duplex): Promise<string> {
  return new Promise((resolve) =>
    stream.once("data", (chunk: Buffer) => resolve(chunk.toString())),
  );
}

describe("exec bodies (U-exec-body)", () => {
  // The script texts are restated as literals, not imported: this test is the reviewed allowlist.
  it("builds the exact exec create body of design 3.2", () => {
    expect(execCreateBody("/bin/bash", TAG, null)).toStrictEqual({
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      Cmd: ["/bin/sh", "-c", 'echo $$ > "/tmp/.terminal-$1.pid"; exec "$0" -l', "/bin/bash", TAG],
      Env: ["TERM=xterm-256color", "LANG=C.UTF-8"],
      User: "1000:1000",
      WorkingDir: "/workspace/home/work",
      ConsoleSize: [24, 80],
    });
  });

  it("adds the agent key to the shell's Env only, under the agent CLI's variable (U-exec-key)", () => {
    const body = execCreateBody("/bin/bash", TAG, AGENT_KEY);

    expect(body).toStrictEqual({
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      Cmd: ["/bin/sh", "-c", 'echo $$ > "/tmp/.terminal-$1.pid"; exec "$0" -l', "/bin/bash", TAG],
      Env: ["TERM=xterm-256color", "LANG=C.UTF-8", `ANTHROPIC_API_KEY=${AGENT_KEY}`],
      User: "1000:1000",
      WorkingDir: "/workspace/home/work",
      ConsoleSize: [24, 80],
    });
    expect(body.Cmd.filter((element) => element.includes(AGENT_KEY))).toEqual([]);
  });

  it("builds the exact kill exec create body", () => {
    expect(killExecCreateBody(TAG)).toStrictEqual({
      AttachStdin: false,
      AttachStdout: false,
      AttachStderr: false,
      Tty: false,
      Cmd: [
        "/bin/sh",
        "-c",
        [
          'f="/tmp/.terminal-$1.pid"',
          'read -r sid < "$f"',
          '[ "$sid" -gt 1 ] || exit 3',
          'pkill -HUP -s "$sid"',
          "sleep 2",
          'pkill -KILL -s "$sid"',
          'rm -f "$f"',
        ].join("\n"),
        "terminal-kill",
        TAG,
      ],
      User: "1000:1000",
      WorkingDir: "/",
    });
  });

  it("builds the exact exec start body", () => {
    expect(execStartBody()).toStrictEqual({ Detach: false, Tty: true });
  });

  it("builds the exact detached start body", () => {
    expect(detachedExecStartBody()).toStrictEqual({ Detach: true, Tty: false });
  });

  it.each([
    ["shell", execCreateBody("/bin/bash", TAG, null)],
    ["kill", killExecCreateBody(TAG)],
  ])("sends the %s create body as JSON with no other key and no query", async (_name, body) => {
    const daemon = await fakeDaemon();
    const engine = new DockerEngine({ socketPath: daemon.socketPath });

    const execId = await engine.createExec(CONTAINER_ID, body);

    expect(execId).toBe(EXEC_ID);
    expect(daemon.requests).toHaveLength(1);
    expect(daemon.requests[0]?.url).toBe(`/v1.44/containers/${CONTAINER_ID}/exec`);
    expect(JSON.parse(daemon.requests[0]?.body ?? "")).toStrictEqual(body);
  });
});

describe("DockerEngine exec calls", () => {
  it("starts the exec hijacked with exactly the start body and passes bytes both ways", async () => {
    const daemon = await fakeDaemon();
    const engine = new DockerEngine({ socketPath: daemon.socketPath });

    const stream = await engine.startExec(EXEC_ID);
    const shell = await daemon.shell;
    const fromShell = nextData(stream);
    shell.write("prompt$ ");
    const toShell = nextData(shell);
    stream.write("echo ok\r");

    expect(daemon.requests[0]?.url).toBe(`/v1.44/exec/${EXEC_ID}/start`);
    expect(JSON.parse(daemon.requests[0]?.body ?? "")).toStrictEqual({ Detach: false, Tty: true });
    expect(await fromShell).toBe("prompt$ ");
    expect(await toShell).toBe("echo ok\r");
    stream.destroy();
  });

  it("switches the hijacked socket's inactivity timeout off, so an idle shell survives it", async () => {
    const daemon = await fakeDaemon();
    const engine = new DockerEngine({ socketPath: daemon.socketPath, timeoutMs: TIMEOUT_MS });
    const stream = await engine.startExec(EXEC_ID);
    const shell = await daemon.shell;
    let timedOut = false;
    stream.on("timeout", () => {
      timedOut = true;
    });

    await sleep(IDLE_MS);
    const fromShell = nextData(stream);
    shell.write("alive");

    expect(timedOut).toBe(false);
    expect(stream.destroyed).toBe(false);
    expect(await fromShell).toBe("alive");
    stream.destroy();
  });

  it("starts a detached exec without an upgrade and releases the response", async () => {
    const daemon = await fakeDaemon();
    const engine = new DockerEngine({
      socketPath: daemon.socketPath,
      timeoutMs: NO_INACTIVITY_TIMEOUT_MS,
    });

    await engine.startDetachedExec(EXEC_ID);

    expect(daemon.detachedStarts).toHaveLength(1);
    const start = daemon.detachedStarts[0];
    expect(JSON.parse(start?.body ?? "")).toStrictEqual({ Detach: true, Tty: false });
    expect(start?.upgrade).toBeUndefined();
    const released = await Promise.race([
      start?.closed.then(() => true),
      sleep(RELEASE_BOUND_MS).then(() => false),
    ]);
    expect(released, `the detached start's socket is still open after ${RELEASE_BOUND_MS} ms`).toBe(
      true,
    );
  });

  it("resizes with the rows as h and the columns as w", async () => {
    const daemon = await fakeDaemon();
    const engine = new DockerEngine({ socketPath: daemon.socketPath });

    await engine.resizeExec(EXEC_ID, 120, 40);

    const url = new URL(daemon.requests[0]?.url ?? "", "http://daemon");
    expect(url.pathname).toBe(`/v1.44/exec/${EXEC_ID}/resize`);
    expect(Object.fromEntries(url.searchParams)).toEqual({ h: "40", w: "120" });
  });

  it("rejects a resize of an ended exec with the daemon's status as DockerApiError", async () => {
    const daemon = await fakeDaemon();
    daemon.resizeStatus = 404;
    const engine = new DockerEngine({ socketPath: daemon.socketPath });

    const failure = await engine.resizeExec(EXEC_ID, 80, 24).then(
      () => null,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(DockerApiError);
    expect(failure).toMatchObject({ operation: "resize exec", statusCode: 404 });
  });

  it("reads Running and ExitCode of an exec and keeps nothing else", async () => {
    const daemon = await fakeDaemon();
    const engine = new DockerEngine({ socketPath: daemon.socketPath });

    expect(await engine.inspectExec(EXEC_ID)).toStrictEqual({ Running: false, ExitCode: 3 });
  });
});
