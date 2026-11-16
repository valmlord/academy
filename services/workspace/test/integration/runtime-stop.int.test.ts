import { setTimeout as sleep } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import { DockerEngine } from "../../src/docker/engine.js";
import { DockerRuntime } from "../../src/docker/runtime.js";
import {
  WorkspaceBusyError,
  WorkspaceIdentityMismatchError,
  WorkspaceNotFoundError,
} from "../../src/errors.js";
import {
  instanceNetworkName,
  LEARNER_GID,
  LEARNER_HOME,
  LEARNER_UID,
  STARTER_MARKER,
  WORK_DIR,
  type WorkspaceKey,
  workspaceId,
  workspaceLabels,
  workspaceNames,
} from "../../src/identity.js";
import {
  type CliResult,
  createIdleContainer,
  createNetwork,
  createVolume,
  docker,
  dockerResult,
  inspectObject,
  TEST_IMAGE,
} from "./docker-cli.js";
import { FIXTURE_COURSE_ROOT, fixtureSpec, TEST_LIMITS } from "./fixtures.js";
import { runLabels, useTestInstance } from "./harness.js";

// Checked stop and delete (design 6.2), and what the hardening and limits of 4.5 mean on the kernel.

const { runId, instance } = useTestInstance("runtime-stop.int.test.ts");

const key: WorkspaceKey = {
  userId: "stop-user",
  courseId: "sample-course",
  lessonId: "with-workspace",
};
/** Same lesson, another learner: labels that parse, but to another key. */
const otherKey: WorkspaceKey = { ...key, userId: "someone-else" };
const names = workspaceNames(instance, workspaceId(instance, key));
const spec = fixtureSpec(key);
/** I-pids' limit: low enough that 128 background sleeps cannot all start. */
const PIDS_TEST_LIMIT = 64;
const SLEEP_PATTERN = "^sleep 30$";
const KEEPER_PATTERN = "^sleep infinity$";
/** An exec needs a free pid itself, so reads while the pids limit is reached are retried. */
const EXEC_ATTEMPTS = 5;
const EXEC_RETRY_MS = 500;
/** Headroom I-pids frees after the fork failure, so its later execs can start. */
const FREED_PIDS = 10;
const LISTEN_PORT = 8080;

function newRuntime(engine: DockerEngine, pidsLimit = TEST_LIMITS.pidsLimit): DockerRuntime {
  return new DockerRuntime({
    engine,
    instance,
    courseRoot: FIXTURE_COURSE_ROOT,
    limits: { ...TEST_LIMITS, pidsLimit },
    agentApiKey: null,
  });
}

async function runningWorkspace(runtime: DockerRuntime): Promise<string> {
  const id = (await runtime.ensureRunning(spec)).workspace.containerId;
  if (id === null) throw new Error("ensureRunning returned no container");
  return id;
}

function learnerExec(containerId: string, command: readonly string[]): Promise<CliResult> {
  return dockerResult(["exec", "-u", `${LEARNER_UID}:${LEARNER_GID}`, containerId, ...command]);
}

/** The first attempt that exits with one of `accepted`; the last result when none does. */
async function retriedExec(
  containerId: string,
  command: readonly string[],
  accepted: readonly number[],
): Promise<CliResult> {
  let result = await learnerExec(containerId, command);
  for (let attempt = 1; attempt < EXEC_ATTEMPTS && !accepted.includes(result.exitCode); attempt++) {
    await sleep(EXEC_RETRY_MS);
    result = await learnerExec(containerId, command);
  }
  return result;
}

function failure(): (error: unknown) => unknown {
  return (error: unknown) => error;
}

/** A field of `/proc/self/status` as the container's own process sees it. */
function statusField(status: string, field: string): string | undefined {
  const line = status.split("\n").find((entry) => entry.startsWith(`${field}:`));
  return line?.slice(field.length + 1).trim();
}

function mountOptions(mounts: string, target: string): string[] {
  const line = mounts.split("\n").find((entry) => entry.split(" ")[1] === target);
  return line?.split(" ")[3]?.split(",") ?? [];
}

describe("DockerRuntime.stop and remove", () => {
  it("I-stop-delete: stops by Id, then removes container and volume, and both calls tolerate absence", async () => {
    const engine = new DockerEngine();
    const runtime = newRuntime(engine);
    const missing = await runtime.stop(key).catch(failure());
    const id = await runningWorkspace(runtime);

    const stopped = await runtime.stop(key);
    const afterStop = await engine.inspectContainer(id);
    await runtime.remove(key);
    const containerAfter = await engine.inspectContainer(id);
    const volumeAfter = await engine.inspectVolume(names.volume);
    await runtime.remove(key);

    expect(missing).toBeInstanceOf(WorkspaceNotFoundError);
    expect([stopped.state, stopped.containerId]).toEqual(["stopped", id]);
    expect(stopped.exit?.reason).toBe("exited");
    expect(afterStop?.State.Running).toBe(false);
    expect([containerAfter, volumeAfter]).toEqual([null, null]);
  });

  it("I-delete-partial: a volume left without its container stops as a no-op and is removed", async () => {
    const engine = new DockerEngine();
    const runtime = newRuntime(engine);
    await runningWorkspace(runtime);
    await engine.removeContainer(names.container, { force: true });

    const stopped = await runtime.stop(key);
    await runtime.remove(key);

    expect([stopped.state, stopped.containerId, stopped.image]).toEqual(["stopped", null, null]);
    expect(await engine.inspectVolume(names.volume)).toBeNull();
  });

  it("refuses to remove a volume another container still uses, and keeps it", async () => {
    const engine = new DockerEngine();
    const runtime = newRuntime(engine);
    await runningWorkspace(runtime);
    await docker([
      "create",
      "--network",
      "none",
      "--label",
      `academy.workspace.test-run=${runId}`,
      "-v",
      `${names.volume}:/data`,
      TEST_IMAGE,
      "true",
    ]);

    const result = await runtime.remove(key).catch(failure());

    expect(result).toBeInstanceOf(WorkspaceBusyError);
    expect(await engine.inspectVolume(names.volume)).not.toBeNull();
  });

  it("I-mismatch (runtime part): a foreign volume under our name survives ensure, stop and remove", async () => {
    const engine = new DockerEngine();
    const runtime = newRuntime(engine);
    await createVolume(names.volume, {
      ...workspaceLabels(instance, otherKey, "volume"),
      ...runLabels(runId),
    });
    const before = await inspectObject("volume", names.volume);

    const results = [
      await runtime.ensureRunning(spec).catch(failure()),
      await runtime.stop(key).catch(failure()),
      await runtime.remove(key).catch(failure()),
    ];

    // The volume first: the 12.5 row "labels before destruction" is guarded by its survival.
    expect((await inspectObject("volume", names.volume))?.labels).toEqual(before?.labels);
    for (const result of results) expect(result).toBeInstanceOf(WorkspaceIdentityMismatchError);
  });

  it("I-mismatch (runtime part): a foreign container under our name survives stop and remove unchanged", async () => {
    const engine = new DockerEngine();
    const runtime = newRuntime(engine);
    const foreignId = await createIdleContainer(names.container, {
      ...workspaceLabels(instance, otherKey, "container"),
      ...runLabels(runId),
    });

    const results = [
      await runtime.stop(key).catch(failure()),
      await runtime.remove(key).catch(failure()),
    ];

    for (const result of results) expect(result).toBeInstanceOf(WorkspaceIdentityMismatchError);
    expect((await inspectObject("container", foreignId))?.state).toBe("created");
  });
});

describe("hardening and limits on the kernel", () => {
  it("I-hardening: non-root, no capabilities, seccomp, read-only root, the tmpfs options and a fixed marker", async () => {
    const engine = new DockerEngine();
    const id = await runningWorkspace(newRuntime(engine));

    const uid = (await learnerExec(id, ["id", "-u"])).stdout.trim();
    const status = (await dockerResult(["exec", id, "cat", "/proc/self/status"])).stdout;
    const mounts = (await dockerResult(["exec", id, "cat", "/proc/mounts"])).stdout;
    const oomScoreAdj = (await dockerResult(["exec", id, "cat", "/proc/1/oom_score_adj"])).stdout;
    const socket = await dockerResult(["exec", id, "test", "-e", "/var/run/docker.sock"]);
    const writes = await learnerExec(id, [
      "sh",
      "-c",
      `echo x > ${LEARNER_HOME}/probe && echo x > /tmp/probe`,
    ]);
    const script = (await learnerExec(id, ["stat", "-c", "%u %a", `${WORK_DIR}/src/main.sh`]))
      .stdout;
    const marker = (await learnerExec(id, ["stat", "-c", "%u:%g %a", STARTER_MARKER])).stdout;
    const removeMarker = await learnerExec(id, ["rm", "-f", STARTER_MARKER]);
    const renameMarker = await learnerExec(id, ["mv", STARTER_MARKER, `${LEARNER_HOME}/marker`]);
    const markerAfter = await learnerExec(id, ["test", "-e", STARTER_MARKER]);

    expect(uid).toBe(String(LEARNER_UID));
    expect(statusField(status, "CapBnd")).toBe("0000000000000000");
    expect(statusField(status, "CapPrm")).toBe("0000000000000000");
    expect(statusField(status, "NoNewPrivs")).toBe("1");
    expect(statusField(status, "Seccomp")).toBe("2");
    expect(mountOptions(mounts, "/")).toContain("ro");
    const tmp = mountOptions(mounts, "/tmp");
    expect(tmp).toEqual(expect.arrayContaining(["nosuid", "nodev", "size=262144k"]));
    expect(tmp).not.toContain("noexec");
    expect(oomScoreAdj.trim()).toBe("500");
    expect(socket.exitCode).not.toBe(0);
    expect(writes.exitCode).toBe(0);
    expect(script.trim()).toBe(`${String(LEARNER_UID)} 755`);
    // Root-owned and read-only (design 5.3): the learner cannot remove it to force a second copy.
    expect(marker.trim()).toBe("0:0 444");
    expect([removeMarker.exitCode, renameMarker.exitCode]).not.toContain(0);
    expect(markerAfter.exitCode).toBe(0);
  });

  it("I-pids: forks fail at the limit, the count stays under it, and killing the test's own processes leaves the keeper", async () => {
    const engine = new DockerEngine();
    const runtime = newRuntime(engine, PIDS_TEST_LIMIT);
    const id = await runningWorkspace(runtime);

    // stdio of every background sleep goes to /dev/null, so the exec returns when the loop ends. busybox sh
    // exits at the first failed fork, and an exec needs several free pids (runc init's threads), so the loop
    // runs in a subshell and the outer shell frees FREED_PIDS of its sleeps with builtins, which fork nothing.
    const forks = await learnerExec(id, [
      "sh",
      "-c",
      `( i=0; while [ $i -lt 128 ]; do sleep 30 </dev/null >/dev/null 2>&1 & echo $! >> /tmp/sleeps; i=$((i+1)); done ); status=$?; n=0; while read p; do [ $n -lt ${String(FREED_PIDS)} ] && kill -9 $p; n=$((n+1)); done < /tmp/sleeps; exit $status`,
    ]);
    const current = await retriedExec(id, ["cat", "/sys/fs/cgroup/pids.current"], [0]);
    const sleepsBefore = await retriedExec(id, ["pgrep", "-f", SLEEP_PATTERN], [0]);
    await retriedExec(id, ["pkill", "-9", "-f", SLEEP_PATTERN], [0]);
    const sleepsAfter = await retriedExec(id, ["pgrep", "-f", SLEEP_PATTERN], [1]);
    const keeper = await learnerExec(id, ["pgrep", "-f", KEEPER_PATTERN]);
    const view = await runtime.inspect(key);
    const followUp = await learnerExec(id, ["true"]);

    expect(forks.exitCode !== 0 || forks.stderr.includes("can't fork")).toBe(true);
    expect(current.exitCode).toBe(0);
    expect(Number(current.stdout.trim())).toBeLessThanOrEqual(PIDS_TEST_LIMIT);
    expect(sleepsBefore.stdout.trim().split("\n").length).toBeGreaterThanOrEqual(1);
    expect(sleepsBefore.exitCode).toBe(0);
    expect(sleepsAfter.exitCode).toBe(1);
    expect(keeper.stdout.trim().split("\n")).toHaveLength(1);
    expect(view?.state).toBe("running");
    expect(followUp.exitCode).toBe(0);
  });
});

/** Per-attempt limit of TCP_PROBE; the value ADR-0002's cross-bridge probe runs observed TIMEOUT with. */
const PROBE_ATTEMPT_MS = 3000;
/**
 * Overall readiness budget of `waitForReply` (design K3): a live listener answered the learner's first connect in
 * 1-7 ms, so this only absorbs node start in the helper and slow `docker exec` on a loaded host. Five attempt
 * timeouts; two polls, the negative probe and setup still fit the 60 s test timeout.
 */
const READY_DEADLINE_MS = 15_000;
const HELPER_LOG_LINES = 20;

// Runs with `node -e`, so the host is argv[1] and the port argv[2]. It reads until the server ends, so the
// client never closes with unread data (that close is a RST, which killed the old helper), and prints exactly
// one line naming the outcome. The timer is a plain setTimeout because the socket `timeout` option is an idle
// timer, not a deadline for the attempt.
const TCP_PROBE = `
const net = require("node:net");
let reply = "";
let isConnected = false;
let isReported = false;
const report = (line) => { if (!isReported) { isReported = true; console.log(line); } };
const socket = net.connect({ host: process.argv[1], port: Number(process.argv[2]) });
const timer = setTimeout(() => {
  report("TIMEOUT " + (isConnected ? "reply" : "connect"));
  socket.destroy();
}, ${String(PROBE_ATTEMPT_MS)});
socket.on("connect", () => { isConnected = true; });
socket.on("data", (chunk) => { reply += chunk; });
socket.on("end", () => { clearTimeout(timer); report("REPLY " + reply); });
socket.on("error", (error) => { clearTimeout(timer); report("ERROR " + (error.code || "unknown")); });
`;
// Without an error listener on the accepted socket, a client's RST is an unhandled ECONNRESET that exits node
// and frees the helper's address (#129). The line goes to stderr, so the helper diagnosis shows it.
const LISTENER = `require("node:net").createServer((s) => { s.on("error", (e) => console.error("listener socket error " + e.code)); s.end("ok"); }).listen(${String(LISTEN_PORT)});`;

type ProbeOutcome =
  | { kind: "reply"; text: string }
  | { kind: "timeout"; phase: "connect" | "reply" }
  | { kind: "error"; code: string }
  | { kind: "exec-failed"; exitCode: number; stdout: string; stderr: string };

type ProbeExec = (command: readonly string[]) => Promise<CliResult>;

interface Helper {
  containerId: string;
  address: string;
  network: string;
}

interface HelperStatus {
  state: string;
  diagnosis: string;
}

const OUTCOME_LINE = /^(?:REPLY (?<text>.*)|TIMEOUT (?<phase>connect|reply)|ERROR (?<code>\S+))$/;

/** Anything but a zero exit with exactly one non-empty line in TCP_PROBE's format is `exec-failed`. */
function parseProbe(result: CliResult): ProbeOutcome {
  const [line, ...rest] = result.stdout.split("\n").filter((entry) => entry.trim() !== "");
  const isSingleLine = result.exitCode === 0 && line !== undefined && rest.length === 0;
  const groups = isSingleLine ? OUTCOME_LINE.exec(line)?.groups : undefined;
  if (groups?.text !== undefined) return { kind: "reply", text: groups.text };
  if (groups?.phase === "connect" || groups?.phase === "reply") {
    return { kind: "timeout", phase: groups.phase };
  }
  if (groups?.code !== undefined) return { kind: "error", code: groups.code };
  const { exitCode, stdout, stderr } = result;
  return { kind: "exec-failed", exitCode, stdout, stderr };
}

function formatOutcome(outcome: ProbeOutcome): string {
  switch (outcome.kind) {
    case "reply":
      return `REPLY ${outcome.text}`;
    case "timeout":
      return `TIMEOUT ${outcome.phase}`;
    case "error":
      return `ERROR ${outcome.code}`;
    case "exec-failed":
      return `exec-failed exit=${String(outcome.exitCode)} stdout=${JSON.stringify(outcome.stdout)} stderr=${JSON.stringify(outcome.stderr)}`;
  }
}

async function probe(exec: ProbeExec, address: string): Promise<ProbeOutcome> {
  return parseProbe(await exec(["node", "-e", TCP_PROBE, address, String(LISTEN_PORT)]));
}

/** Logs are read only from helpers this test started, which print nothing but the listener's error lines. */
async function helperStatus(helper: Helper): Promise<HelperStatus> {
  const inspected = await inspectObject("container", helper.containerId);
  const state = inspected === null ? "missing" : (inspected.state ?? "unknown");
  const logs = await dockerResult(["logs", "--tail", String(HELPER_LOG_LINES), helper.containerId]);
  const tail = `${logs.stdout}${logs.stderr}`.trim();
  const diagnosis = `helper ${helper.containerId} on ${helper.network} at ${helper.address} is ${state}; log tail: ${tail === "" ? "(empty)" : tail}`;
  return { state, diagnosis };
}

/** Why polling stops without `REPLY ok`, or `null` to poll on. */
function pollFailure(outcome: ProbeOutcome, state: string, elapsedMs: number): string | null {
  if (outcome.kind === "reply") return "another process answered";
  if (state !== "running") return "the helper is not running";
  if (elapsedMs >= READY_DEADLINE_MS) return `no REPLY ok within ${String(READY_DEADLINE_MS)} ms`;
  return null;
}

/** Probes `helper` from the container behind `exec` until it answers `ok`, on the path the assertions use. */
async function waitForReply(exec: ProbeExec, helper: Helper): Promise<void> {
  const startedAt = Date.now();
  for (let attempt = 1; ; attempt++) {
    const outcome = await probe(exec, helper.address);
    if (outcome.kind === "reply" && outcome.text === "ok") return;
    const status = await helperStatus(helper);
    const elapsedMs = Date.now() - startedAt;
    const reason = pollFailure(outcome, status.state, elapsedMs);
    if (reason !== null) {
      throw new Error(
        `${reason}: ${helper.address}:${String(LISTEN_PORT)} (helper ${helper.containerId} on ${helper.network}) ` +
          `after ${String(attempt)} attempts in ${String(elapsedMs)} ms; last outcome ${formatOutcome(outcome)}; ` +
          status.diagnosis,
      );
    }
    // A timed-out attempt already waited PROBE_ATTEMPT_MS; only a fast failure needs a pause before the next one.
    if (outcome.kind !== "timeout") await sleep(EXEC_RETRY_MS);
  }
}

/** A listener of this run on `network`; readiness is `waitForReply`'s job, from the container that matters. */
async function listenerOn(network: string): Promise<Helper> {
  const containerId = (
    await docker([
      "run",
      "-d",
      "--network",
      network,
      "--label",
      `academy.workspace.test-run=${runId}`,
      TEST_IMAGE,
      "node",
      "-e",
      LISTENER,
    ])
  ).trim();
  const address = (await docker(["exec", containerId, "hostname", "-i"])).trim();
  return { containerId, address, network };
}

/** A container of this run on `network` that probes from inside it. Returns the Id. */
async function peerOn(network: string): Promise<string> {
  const args = ["run", "-d", "--init", "--network", network];
  const labels = ["--label", `academy.workspace.test-run=${runId}`];
  return (await docker([...args, ...labels, TEST_IMAGE, "sleep", "infinity"])).trim();
}

describe("network", () => {
  it("I-network: one network only; a helper on it is reachable and a helper on another network is not", async () => {
    const engine = new DockerEngine();
    // The other network exists before the workspace, so a spec that also attached it would succeed.
    const otherNetwork = `${instanceNetworkName(instance)}-helper`;
    await createNetwork(otherNetwork, runLabels(runId));
    const id = await runningWorkspace(newRuntime(engine));
    // Every container starts before the first poll: vitest does not stop a timed-out test body, so a
    // `docker run` after a long poll could start a container once afterEach has already cleaned up.
    const sameHelper = await listenerOn(instanceNetworkName(instance));
    const otherHelper = await listenerOn(otherNetwork);
    const peerId = await peerOn(otherNetwork);
    const learner: ProbeExec = (command) => learnerExec(id, command);
    const peer: ProbeExec = (command) => dockerResult(["exec", peerId, ...command]);

    // `/sys/class/net` is not namespaced on Docker Desktop; interfaces with an IPv4 address are.
    const interfaces = (await learnerExec(id, ["ip", "-o", "-4", "addr", "show"])).stdout;
    await waitForReply(learner, sameHelper);
    // The other helper serves its own network right before the negative probe, and the peer probes it again
    // right after, so a timeout from the learner means isolation, not a dead helper.
    await waitForReply(peer, otherHelper);
    const isolation = await probe(learner, otherHelper.address);
    const after = await probe(peer, otherHelper.address);
    const sameStatus = await helperStatus(sameHelper);
    const otherStatus = await helperStatus(otherHelper);

    const interfaceNames = interfaces
      .trim()
      .split("\n")
      .map((line) => line.split(/\s+/)[1]);
    const afterMessage = `peer probe after the isolation probe: ${formatOutcome(after)}; ${otherStatus.diagnosis}`;
    const isolationMessage = `expected TIMEOUT connect from the learner, got ${formatOutcome(isolation)}`;
    expect(interfaceNames.sort(), interfaces).toEqual(["eth0", "lo"]);
    expect(after, afterMessage).toEqual({ kind: "reply", text: "ok" });
    expect(sameStatus.state, sameStatus.diagnosis).toBe("running");
    expect(otherStatus.state, otherStatus.diagnosis).toBe("running");
    expect(isolation, isolationMessage).toEqual({ kind: "timeout", phase: "connect" });
  });
});
