import { Writable } from "node:stream";
import { setTimeout as sleep } from "node:timers/promises";
import type { WebSocket } from "@fastify/websocket";
import { describe, expect, it } from "vitest";
import { readCourseLessons } from "../../src/course/lessons.js";
import { DockerEngine } from "../../src/docker/engine.js";
import { DockerRuntime } from "../../src/docker/runtime.js";
import { buildApp } from "../../src/http/app.js";
import type { WorkspaceKey } from "../../src/identity.js";
import { IdleTracker } from "../../src/idle.js";
import { KeyedMutex } from "../../src/lock.js";
import { type ServiceLog, WorkspaceManager } from "../../src/manager.js";
import { TerminalRegistry } from "../../src/terminal/registry.js";
import { processArgs, TEST_IMAGE } from "./docker-cli.js";
import { FIXTURE_COURSE_ROOT, TEST_LIMITS } from "./fixtures.js";
import { onCleanup, useTestInstance } from "./harness.js";

// The terminal route on the real daemon (design 10.2, #110): `buildApp` with the Docker runtime, sockets through
// Fastify's `injectWS`. Each test's workspace is removed by the harness afterwards.

const { instance } = useTestInstance("terminal.int.test.ts");

const SECRET = "i-term-secret-0123456789abcdef-0123";
const COURSE_ID = "sample-course";
const LESSON_ID = "with-workspace";
const OUTPUT_TIMEOUT_MS = 15_000;
const POLL_MS = 100;
/**
 * I-term-flow: output counts as stopped once it is unchanged for FLOW_STABLE_MS; a slow runner may need far
 * longer than a fixed wait to reach the high-water mark, so the deadline only bounds a broken run.
 */
const FLOW_STABLE_MS = 1_000;
const FLOW_SETTLE_DEADLINE_MS = 30_000;
/** HIGH_WATER_BYTES in src/terminal/session.ts: the ack gate pauses the shell only above it. */
const HIGH_WATER_BYTES = 1024 * 1024;
const FLOW_BOUND_BYTES = 1.5 * 1024 * 1024;
const FLOW_TEST_TIMEOUT_MS = 60_000;
/** The issue's bound (#110): every process of an ended session is gone this long after the end. */
const KILL_DEADLINE_MS = 10_000;
/** KILL_GRACE_SECONDS in src/docker/spec.ts: the kill script's wait between HUP and KILL. */
const KILL_GRACE_MS = 2_000;
/** How long typed jobs may take to show up in `ps`. */
const JOBS_DEADLINE_MS = 10_000;
const SHELL_COMMAND = "/bin/sh -l";
const SLEEP_COMMAND = "sleep 4242";
const NOHUP_SLEEP_COMMAND = "sleep 4243";

function keyFor(userId: string): WorkspaceKey {
  return { userId, courseId: COURSE_ID, lessonId: LESSON_ID };
}

function pathFor(key: WorkspaceKey): string {
  return `/v1/users/${key.userId}/courses/${key.courseId}/lessons/${key.lessonId}/workspace/terminal`;
}

interface Client {
  ws: WebSocket;
  texts: unknown[];
  /** Binary output decoded so far, and its size in bytes. */
  output: () => string;
  receivedBytes: () => number;
  closed: Promise<{ code: number; reason: string }>;
  type: (line: string) => void;
  waitFor: (pattern: RegExp) => Promise<void>;
}

interface Service {
  manager: WorkspaceManager;
  terminals: TerminalRegistry;
  connect: (key: WorkspaceKey) => Promise<Client>;
}

/** A line that is exactly `value`, not the echoed command that printed it. */
function line(value: string): RegExp {
  return new RegExp(`(^|\\n)${value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}\\r?\\n`);
}

async function startService(): Promise<Service> {
  const runtime = new DockerRuntime({
    engine: new DockerEngine(),
    instance,
    courseRoot: FIXTURE_COURSE_ROOT,
    limits: TEST_LIMITS,
    agentApiKey: null,
  });
  const mutex = new KeyedMutex();
  const log: ServiceLog = { info: () => {}, warn: () => {} };
  const stopHooks = {
    onStopping: (id: string) => terminals.onStopping(id),
    onStopRejected: (id: string) => terminals.onStopRejected(id),
  };
  const manager = new WorkspaceManager({
    runtime,
    readCourse: () => readCourseLessons(FIXTURE_COURSE_ROOT),
    instance,
    imageOverride: TEST_IMAGE,
    tracker: new IdleTracker({ stopMinutes: 30, warningMinutes: 5, now: Date.now }),
    mutex,
    log,
    now: Date.now,
    stopHooks,
  });
  const terminals = new TerminalRegistry({
    runtime,
    workspaces: manager,
    mutex,
    instance,
    shell: "/bin/sh",
    scrollbackLines: 1000,
    log,
  });
  const { app } = buildApp({
    secret: SECRET,
    manager,
    settings: {
      idleStopMinutes: 30,
      idleWarningMinutes: 5,
      startSlowSeconds: 10,
      hasAgentApiKey: false,
    },
    limits: TEST_LIMITS,
    terminals,
    // The request log is not under test here.
    logStream: new Writable({ write: (_chunk, _encoding, callback) => callback() }),
  });
  await app.ready();
  onCleanup(async () => {
    terminals.closeAll();
    await app.close();
  });

  async function connect(key: WorkspaceKey): Promise<Client> {
    const texts: unknown[] = [];
    let output = "";
    let receivedBytes = 0;
    let resolveClosed: (event: { code: number; reason: string }) => void = () => undefined;
    const closed = new Promise<{ code: number; reason: string }>((resolve) => {
      resolveClosed = resolve;
    });
    const ws = await app.injectWS(
      pathFor(key),
      { headers: { authorization: `Bearer ${SECRET}` } },
      {
        onInit: (socket) => {
          socket.on("ping", () => socket.pong());
          socket.on("message", (data, isBinary) => {
            const bytes = Array.isArray(data)
              ? Buffer.concat(data)
              : Buffer.isBuffer(data)
                ? data
                : Buffer.from(data);
            if (isBinary) {
              receivedBytes += bytes.length;
              output += bytes.toString("utf8");
            } else {
              texts.push(JSON.parse(bytes.toString("utf8")));
            }
          });
          socket.on("close", (code, reason) => resolveClosed({ code, reason: reason.toString() }));
        },
      },
    );
    onCleanup(() => {
      ws.terminate();
    });
    return {
      ws,
      texts,
      output: () => output,
      receivedBytes: () => receivedBytes,
      closed,
      type: (text) => ws.send(JSON.stringify({ t: "input", d: `${text}\r` })),
      async waitFor(pattern) {
        const deadline = Date.now() + OUTPUT_TIMEOUT_MS;
        while (!pattern.test(output)) {
          if (Date.now() > deadline) {
            throw new Error(`no ${pattern.source} in the terminal within ${OUTPUT_TIMEOUT_MS} ms`);
          }
          await sleep(POLL_MS);
        }
      },
    };
  }

  return { manager, terminals, connect };
}

async function attached(client: Client): Promise<void> {
  const deadline = Date.now() + OUTPUT_TIMEOUT_MS;
  while (client.texts.length === 0) {
    if (Date.now() > deadline) throw new Error("no attached frame");
    await sleep(POLL_MS);
  }
}

async function runningContainerId(service: Service, key: WorkspaceKey): Promise<string> {
  const containerId = (await service.manager.ensure(key)).workspace.containerId;
  if (containerId === null) throw new Error("ensure returned no container");
  return containerId;
}

/**
 * Polls the container's process list until `done` holds or `deadline` (epoch ms) passes, and returns the last
 * listing either way, so the caller asserts on what was really there.
 */
async function listingUntil(
  containerId: string,
  done: (listing: readonly string[]) => boolean,
  deadline: number,
): Promise<string[]> {
  let listing = await processArgs(containerId);
  while (!done(listing) && Date.now() <= deadline) {
    await sleep(POLL_MS);
    listing = await processArgs(containerId);
  }
  return listing;
}

function count(listing: readonly string[], command: string): number {
  return listing.filter((entry) => entry === command).length;
}

async function stoppedBytes(client: Client): Promise<number> {
  const deadline = Date.now() + FLOW_SETTLE_DEADLINE_MS;
  let stableSince = Date.now();
  let last = client.receivedBytes();
  while (Date.now() - stableSince < FLOW_STABLE_MS) {
    if (Date.now() > deadline)
      throw new Error(`output still growing at ${last} bytes after ${FLOW_SETTLE_DEADLINE_MS} ms`);
    await sleep(POLL_MS);
    const current = client.receivedBytes();
    if (current !== last) {
      last = current;
      stableSince = Date.now();
    }
  }
  return last;
}

describe("terminal sessions on the real daemon", () => {
  it("I-term-resume: a reconnect gets the screen and the same shell", async () => {
    const service = await startService();
    const key = keyFor("t32-resume");
    await service.manager.ensure(key);
    const first = await service.connect(key);
    await attached(first);
    first.type("export T32=resumed");
    first.type("echo marker-before");
    await first.waitFor(line("marker-before"));

    first.ws.terminate();
    const second = await service.connect(key);
    await attached(second);
    second.type("echo $T32");
    await second.waitFor(line("resumed"));

    expect(first.texts[0]).toEqual({ t: "attached", resumed: false });
    expect(second.texts[0]).toEqual({ t: "attached", resumed: true });
    expect(JSON.stringify(second.texts[1])).toContain("marker-before");
  });

  it("I-term-resize: the shell sees the size the client sent", async () => {
    const service = await startService();
    const key = keyFor("t32-resize");
    await service.manager.ensure(key);
    const client = await service.connect(key);
    await attached(client);

    client.ws.send(JSON.stringify({ t: "resize", cols: 120, rows: 40 }));
    client.type("stty size");

    await client.waitFor(line("40 120"));
  });

  it("I-term-takeover: a second connection closes the first with 4001", async () => {
    const service = await startService();
    const key = keyFor("t32-takeover");
    await service.manager.ensure(key);
    const first = await service.connect(key);
    await attached(first);

    const second = await service.connect(key);

    expect(await first.closed).toEqual({ code: 4001, reason: "taken over" });
    await attached(second);
  });

  it("I-term-exit: the shell's exit closes with its code, and the next connection gets a new shell", async () => {
    const service = await startService();
    const key = keyFor("t32-exit");
    await service.manager.ensure(key);
    const first = await service.connect(key);
    await attached(first);

    first.type("exit 3");
    const closed = await first.closed;
    const second = await service.connect(key);
    await attached(second);
    // The first session's kill, started at its 4000, runs its HUP and KILL meanwhile: the new shell must survive it.
    await sleep(KILL_GRACE_MS + 1_000);
    second.type("echo ok");

    expect(closed).toEqual({ code: 4000, reason: "exit 3" });
    expect(second.texts[0]).toEqual({ t: "attached", resumed: false });
    await second.waitFor(line("ok"));
  });

  it("I-term-end-kills: the shell and all its jobs are gone within 10 s of the end", async () => {
    const service = await startService();
    const key = keyFor("t110-end");
    const containerId = await runningContainerId(service, key);
    const client = await service.connect(key);
    await attached(client);
    client.type(`${SLEEP_COMMAND} &`);
    client.type(`nohup ${NOHUP_SLEEP_COMMAND} >/dev/null 2>&1 &`);
    client.type(SLEEP_COMMAND);
    const started = await listingUntil(
      containerId,
      (listing) => count(listing, SLEEP_COMMAND) === 2 && count(listing, NOHUP_SLEEP_COMMAND) === 1,
      Date.now() + JOBS_DEADLINE_MS,
    );
    if (count(started, SLEEP_COMMAND) !== 2 || count(started, NOHUP_SLEEP_COMMAND) !== 1) {
      throw new Error(`jobs did not start:\n${started.join("\n")}`);
    }

    service.terminals.closeAll();
    const deadline = Date.now() + KILL_DEADLINE_MS;

    expect(await client.closed).toEqual({ code: 1001, reason: "service shutting down" });
    const ended = (listing: readonly string[]): boolean =>
      [SHELL_COMMAND, SLEEP_COMMAND, NOHUP_SLEEP_COMMAND].every(
        (command) => !listing.includes(command),
      );
    const last = await listingUntil(containerId, ended, deadline);
    expect(ended(last), `still running after ${KILL_DEADLINE_MS} ms:\n${last.join("\n")}`).toBe(
      true,
    );
  });

  it("I-term-exit-kills-jobs: a background job left by exit is gone after the 4000", async () => {
    const service = await startService();
    const key = keyFor("t110-exit");
    const containerId = await runningContainerId(service, key);
    const client = await service.connect(key);
    await attached(client);
    client.type(`${SLEEP_COMMAND} &`);
    const started = await listingUntil(
      containerId,
      (listing) => listing.includes(SLEEP_COMMAND),
      Date.now() + JOBS_DEADLINE_MS,
    );
    if (!started.includes(SLEEP_COMMAND))
      throw new Error(`job did not start:\n${started.join("\n")}`);

    client.type("exit");

    expect(await client.closed).toEqual({ code: 4000, reason: "exit 0" });
    const gone = (listing: readonly string[]): boolean => !listing.includes(SLEEP_COMMAND);
    const last = await listingUntil(containerId, gone, Date.now() + KILL_DEADLINE_MS);
    expect(gone(last), `still running after ${KILL_DEADLINE_MS} ms:\n${last.join("\n")}`).toBe(
      true,
    );
  });

  it("I-term-stop: stopping the workspace closes the client with 4002", async () => {
    const service = await startService();
    const key = keyFor("t32-stop");
    await service.manager.ensure(key);
    const client = await service.connect(key);
    await attached(client);

    await service.manager.stop(key);

    expect(await client.closed).toEqual({ code: 4002, reason: "environment stopped" });
  });

  it("I-term-cross-user: two users on the same lesson have separate shells", async () => {
    const service = await startService();
    const keyA = keyFor("t32a");
    const keyB = keyFor("t32b");
    await service.manager.ensure(keyA);
    await service.manager.ensure(keyB);
    const clientA = await service.connect(keyA);
    const clientB = await service.connect(keyB);
    await attached(clientA);
    await attached(clientB);

    clientA.type("export T32=a");
    clientA.type("echo marker-of-a");
    await clientA.waitFor(line("marker-of-a"));
    clientB.type("echo ${T32:-unset}");
    await clientB.waitFor(line("unset"));

    expect(clientB.output()).not.toContain("marker-of-a");
  });

  it(
    "I-term-flow: output stops below 1.5 MiB without acks and continues after them",
    async () => {
      const service = await startService();
      const key = keyFor("t32-flow");
      await service.manager.ensure(key);
      const client = await service.connect(key);
      await attached(client);

      client.type("yes | head -c 50000000");
      const settled = await stoppedBytes(client);
      await sleep(FLOW_STABLE_MS);
      const later = client.receivedBytes();
      client.ws.send(JSON.stringify({ t: "ack", n: later }));
      await sleep(FLOW_STABLE_MS);

      expect(settled).toBeGreaterThan(0);
      expect(settled).toBeGreaterThan(HIGH_WATER_BYTES);
      expect(later).toBe(settled);
      expect(later).toBeLessThan(FLOW_BOUND_BYTES);
      expect(client.receivedBytes()).toBeGreaterThan(later);
    },
    FLOW_TEST_TIMEOUT_MS,
  );
});
