import { randomBytes } from "node:crypto";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import { loadChecks } from "../../src/course/checks.js";
import { DockerEngine } from "../../src/docker/engine.js";
import { DockerRuntime } from "../../src/docker/runtime.js";
import { buildChecksTar } from "../../src/docker/tar.js";
import type { CheckSlot, WorkspaceKey } from "../../src/identity.js";
import type { CheckProcess, CleanupKind, CleanupResult, ExitStatus } from "../../src/runtime.js";
import {
  docker,
  dockerResult,
  processArgs,
  restartContainer,
  slotFileExists,
  stopOwnContainer,
  uidProcesses,
} from "./docker-cli.js";
import { FIXTURE_COURSE_ROOT, FIXTURE_LESSON_DIR, fixtureSpec, TEST_LIMITS } from "./fixtures.js";
import { onCleanup, useTestInstance } from "./harness.js";

// Check execs on the real daemon: a deleted work dir stops the setup with exit 123 before the marker, the slot's next
// start removes what an unterminated run left in its scratch, the grader's HOME and TMPDIR are new dirs in the slot's
// scratch, not the learner's, and `terminate` ends a check with its cleanup exec. "No process left" is always counted
// from outside, by `uidProcesses` or the process list, never by the return code of `kill -1`.

const { instance } = useTestInstance("checks-exec.int.test.ts");

const key: WorkspaceKey = {
  userId: "check-user",
  courseId: "sample-course",
  lessonId: "with-workspace",
};
const TEST_TIMEOUT_MS = 40_000;
/** I-c8 and I-c14 fill the pids limit or run a killer, then restart the container. */
const PIDS_TEST_TIMEOUT_MS = 90_000;
/** The attach stream's end and Docker's record of the exit code are two events; this bounds the gap at 2 s. */
const EXIT_STATUS_READS = 20;
const EXIT_STATUS_POLL_MS = 100;
const LEARNER_USER = "1000:1000";
/** Slot 0's uid, and so its scratch dir under the grader root. */
const SLOT_SCRATCH = "/workspace/.academy-grader/2000";
/** The work dir exit code of the check setup. */
const WORK_DIR_EXIT = 123;
/** Docker's exit code for an exec it could not spawn, as at a full pids limit. */
const SPAWN_FAILED_EXIT = 128;
const PIDS_FULL_POLL_MS = 200;
const PIDS_FULL_ROUNDS = 25;
const CLEAN: CleanupResult = { kind: "clean", exitCode: 0, httpStatus: null };
/** Every kind of the port's `CleanupKind`. */
const CLEANUP_KINDS: readonly CleanupKind[] = [
  "clean",
  "processes-left",
  "files-left",
  "processes-and-files-left",
  "no-proc",
  "not-started",
  "killed",
  "unexpected-exit",
  "container-stopped",
  "timed-out",
  "docker-error",
  "cleanup-started",
];

interface StartWorkspaceOptions {
  /** Extra files written into the course copy's `checks/` before the tar is built. */
  checksFiles?: Readonly<Record<string, string>>;
  agentApiKey?: string | null;
}

interface Started {
  runtime: DockerRuntime;
  containerId: string;
  checksTar: Buffer;
  /** The content of `checks/secret.txt`, without its newline. */
  canary: string;
}

/**
 * A running workspace on a copy of the fixture course whose checks hold a random canary, and the checks tar read
 * from it as the check runner reads it.
 */
async function startWorkspace(options: StartWorkspaceOptions = {}): Promise<Started> {
  const root = await mkdtemp(join(tmpdir(), "wks-checks-"));
  onCleanup(() => rm(root, { recursive: true, force: true }));
  await cp(FIXTURE_COURSE_ROOT, root, { recursive: true });
  const canary = randomBytes(16).toString("hex");
  const checksDir = join(root, FIXTURE_LESSON_DIR, "checks");
  await writeFile(join(checksDir, "secret.txt"), `${canary}\n`);
  for (const [name, content] of Object.entries(options.checksFiles ?? {})) {
    await writeFile(join(checksDir, name), content);
  }
  const checksTar = await buildChecksTar(await loadChecks(root, FIXTURE_LESSON_DIR), new Date());
  const runtime = new DockerRuntime({
    engine: new DockerEngine(),
    instance,
    courseRoot: root,
    limits: TEST_LIMITS,
    agentApiKey: options.agentApiKey ?? null,
  });
  const containerId = (await runtime.ensureRunning(fixtureSpec(key))).workspace.containerId;
  if (containerId === null) throw new Error("ensureRunning returned no container");
  return { runtime, containerId, checksTar, canary };
}

async function startCheck(
  started: Started,
  run: string,
  slot: CheckSlot = 0,
): Promise<CheckProcess> {
  return started.runtime.startCheck({ key, checksTar: started.checksTar, run, slot });
}

/** Polls until `condition` holds or the rounds run out; the assertion after it reports which. */
async function pollUntil(
  condition: () => boolean | Promise<boolean>,
  pollMs: number,
  rounds: number,
): Promise<void> {
  for (let round = 0; round < rounds && !(await condition()); round += 1) await sleep(pollMs);
}

function asLearner(containerId: string, command: readonly string[]): readonly string[] {
  return ["exec", "-u", LEARNER_USER, containerId, ...command];
}

/** Read after `ended`: the last value once it is no longer `running`, or `running` after the bound. */
async function settledExitStatus(check: CheckProcess): Promise<ExitStatus> {
  let status = await check.exitStatus();
  for (let read = 1; read < EXIT_STATUS_READS && status === "running"; read += 1) {
    await sleep(EXIT_STATUS_POLL_MS);
    status = await check.exitStatus();
  }
  return status;
}

function linesOf(text: string): string[] {
  return text.split("\n").filter((line) => line !== "");
}

describe("check execs on the real daemon", () => {
  it(
    "I-c5: a deleted work dir does not start the check",
    async () => {
      const started = await startWorkspace();
      await docker([
        "exec",
        "-u",
        LEARNER_USER,
        started.containerId,
        "rm",
        "-rf",
        "/workspace/home/work",
      ]);

      const check = await startCheck(started, "echo ran");
      const setup = await check.setup;
      await check.ended;
      const exitStatus = await settledExitStatus(check);

      expect(setup.kind).toBe("not-started");
      const reason = setup.kind === "not-started" ? setup.reason : null;
      expect(["ended-before-marker", "stdin-failed"]).toContain(reason);
      expect(exitStatus).toBe(WORK_DIR_EXIT);
      expect(check.stdout().text).toBe("");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "I-c7b: the slot's next start empties the scratch of a run left unterminated",
    async () => {
      const started = await startWorkspace();
      const first = await startCheck(
        started,
        'touch "$ACADEMY_GRADER_SCRATCH/f" "$ACADEMY_GRADER_SCRATCH/.h"; ls -A "$ACADEMY_GRADER_SCRATCH"',
      );
      await first.ended;

      const second = await startCheck(started, 'ls -A "$ACADEMY_GRADER_SCRATCH"');
      const secondSetup = await second.setup;
      await second.ended;

      expect(await first.setup).toStrictEqual({ kind: "started" });
      expect(linesOf(first.stdout().text)).toStrictEqual([".h", "checks", "f", "home", "tmp"]);
      expect(secondSetup).toStrictEqual({ kind: "started" });
      expect(linesOf(second.stdout().text)).toStrictEqual(["checks", "home", "tmp"]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "I-c9: the grader's HOME and TMPDIR are its own",
    async () => {
      const started = await startWorkspace();
      const learnerHome = [
        "exec",
        "-u",
        LEARNER_USER,
        started.containerId,
        "ls",
        "-A",
        "/workspace/home",
      ];
      const learnerHomeBefore = await docker(learnerHome);

      const check = await startCheck(
        started,
        [
          'echo "home=$HOME"',
          'ls -A "$HOME" | wc -l',
          'ls -ldn "$HOME"',
          'echo "tmp=$TMPDIR"',
          `node -e 'console.log(require("os").tmpdir())'`,
        ].join("; "),
      );
      await check.ended;
      const lines = linesOf(check.stdout().text);
      const homeFields = (lines[2] ?? "").trim().split(/\s+/);

      expect(lines[0]).toBe(`home=${SLOT_SCRATCH}/home`);
      expect((lines[1] ?? "").trim()).toBe("0");
      expect(homeFields[0]).toBe("drwx------");
      expect(homeFields[2]).toBe("2000");
      expect(lines[3]).toBe(`tmp=${SLOT_SCRATCH}/tmp`);
      expect(lines[4]).toBe(`${SLOT_SCRATCH}/tmp`);
      expect(await docker(learnerHome)).toBe(learnerHomeBefore);
    },
    TEST_TIMEOUT_MS,
  );
});

/** I-c2: what uid 1000 can see of a running check's slot, one line per probe. */
const TERMINAL_PROBE = [
  "s=/workspace/.academy-grader/2000",
  'ls "$s" >/dev/null 2>&1 && echo probe-listed || echo probe-denied',
  'cat "$s/checks/secret.txt" >/dev/null 2>&1 && echo probe-read || echo probe-denied',
  'grep -rqs "$1" /workspace /tmp /dev/shm && echo probe-found || echo probe-absent',
].join("\n");

/**
 * I-c4, slot 1: waits for slot 0's distinctive `sleep 31`, so its read races a live copy of slot 0's checks, and says
 * `B-late` when slot 0 never showed up instead of passing a read that raced nothing.
 */
const OTHER_SLOT_READER = [
  "i=0",
  "while [ $i -lt 20 ]; do ps -o args | grep -q '[s]leep 31' && break; i=$((i + 1)); sleep 1; done",
  "[ $i -lt 20 ] && echo B-saw || echo B-late",
  "cat /workspace/.academy-grader/2000/checks/secret.txt >/dev/null 2>&1 && echo B-read || echo B-denied",
  'cat "$ACADEMY_CHECKS_DIR/secret.txt" >/dev/null && echo B-own',
  "echo B-done",
].join("\n");

const PLANTED_PROBE = `try { require("academy-probe"); console.log("probe-LOADED") } catch (error) { console.log("probe-" + error.code) }`;

describe("check execs ended by terminate on the real daemon", () => {
  it(
    "I-c1: pass, fail and exit 3 each end eof and clean up",
    async () => {
      const started = await startWorkspace();
      const runs: [string, number][] = [
        ['sh "$ACADEMY_CHECKS_DIR/verify.sh"', 0],
        ["echo fail-message; exit 1", 1],
        ["echo format-message; exit 3", 3],
      ];

      for (const [run, code] of runs) {
        const check = await startCheck(started, run);
        expect(await check.setup, "I-c1 setup started").toStrictEqual({ kind: "started" });
        expect(await check.ended, "ended eof").toBe("eof");
        expect(await settledExitStatus(check), "exit status").toBe(code);
        expect(await check.terminate({ wait: true }), "terminate clean").toStrictEqual(CLEAN);
      }
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "I-c2: the terminal uid cannot read the checks of a running check",
    async () => {
      const started = await startWorkspace();
      const check = await startCheck(started, 'cat "$ACADEMY_CHECKS_DIR/secret.txt"; sleep 30');
      await check.setup;
      await pollUntil(() => check.stdout().text !== "", 100, 20);

      const probe = await docker(
        asLearner(started.containerId, ["sh", "-c", TERMINAL_PROBE, "probe", started.canary]),
      );

      expect(linesOf(check.stdout().text)[0], "the check reads its own checks").toBe(
        started.canary,
      );
      expect(linesOf(probe), "terminal probe").toStrictEqual([
        "probe-denied",
        "probe-denied",
        "probe-absent",
      ]);
      expect(await check.terminate({ wait: true }), "I-c2 terminate clean").toStrictEqual(CLEAN);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "I-c3: terminate ends an orphan in a new session",
    async () => {
      const started = await startWorkspace();
      const check = await startCheck(
        started,
        "setsid sleep 300 </dev/null >/dev/null 2>&1 & echo spawned",
      );
      await check.ended;

      const before = await uidProcesses(started.containerId, 2000);
      expect(
        before.some((entry) => entry.args.includes("sleep 300")),
        "the orphan runs before terminate",
      ).toBe(true);
      const result = await check.terminate({ wait: true });

      expect(
        await processArgs(started.containerId),
        "after terminate no sleep 300 in processArgs",
      ).not.toContain("sleep 300");
      expect(
        await uidProcesses(started.containerId, 2000),
        "no uid-2000 process after terminate",
      ).toStrictEqual([]);
      expect(result, "I-c3 terminate clean").toStrictEqual(CLEAN);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "I-c4: concurrent slots, and the uid of another slot cannot read the checks of a running check",
    async () => {
      const started = await startWorkspace();
      const other = await startCheck(started, OTHER_SLOT_READER, 1);
      await other.setup;
      const own = await startCheck(started, 'cat "$ACADEMY_CHECKS_DIR/secret.txt"; sleep 31');
      await own.setup;
      await other.ended;
      const otherLines = linesOf(other.stdout().text);

      expect(
        { exit: await settledExitStatus(other), last: otherLines.at(-1) },
        "slot 1 ends with exit status 0 and B-done",
      ).toStrictEqual({ exit: 0, last: "B-done" });
      expect(otherLines, "I-c4 B lines").toStrictEqual(["B-saw", "B-denied", "B-own", "B-done"]);
      expect(linesOf(own.stdout().text)[0], "I-c4 A reads its copy").toBe(started.canary);
      expect(await own.terminate({ wait: true }), "I-c4 A clean").toStrictEqual(CLEAN);
      expect(await other.terminate({ wait: true }), "I-c4 B clean").toStrictEqual(CLEAN);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "I-c6: a container stop during a run, at the primitive level",
    async () => {
      const started = await startWorkspace();
      const check = await startCheck(started, "echo up; sleep 300");
      await check.setup;
      const isRunningBefore = await check.isContainerRunning();
      await stopOwnContainer(started.containerId, instance);
      const end = await check.ended;

      expect(isRunningBefore, "I-c6 running before the stop").toBe(true);
      expect(end, "I-c6 ended eof after the stop").toBe("eof");
      expect(await check.isContainerRunning(), "I-c6 not running after the stop").toBe(false);
      expect(
        await check.terminate({ wait: true }),
        "I-c6 terminate on a stopped container",
      ).toStrictEqual({ kind: "container-stopped", exitCode: null, httpStatus: 409 });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "I-c7: the scratch is private during a run and empty after terminate",
    async () => {
      const started = await startWorkspace();
      const check = await startCheck(started, 'ls -ldn "$ACADEMY_GRADER_SCRATCH"');
      await check.ended;
      const fields = (linesOf(check.stdout().text)[0] ?? "").trim().split(/\s+/);

      expect(
        { mode: fields[0], uid: fields[2] },
        "the run prints drwx------ 2000 for the scratch",
      ).toStrictEqual({ mode: "drwx------", uid: "2000" });
      const result = await check.terminate({ wait: true });
      const listing = await docker([
        "exec",
        "-u",
        "2000:2000",
        started.containerId,
        "ls",
        "-A",
        SLOT_SCRATCH,
      ]);
      expect(listing, "after terminate the scratch is empty").toBe("");
      expect(result, "I-c7 terminate clean").toStrictEqual(CLEAN);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "I-c8: a full pids limit keeps the cleanup from starting, and after a container restart the next start of the slot empties what it left",
    async () => {
      const started = await startWorkspace();
      const id = started.containerId;
      // Retries every failed fork at once, so it keeps the limit full until the container stops.
      const check = await startCheck(
        started,
        `touch "$ACADEMY_GRADER_SCRATCH/a-left"; setsid sh -c 'while :; do sleep 300 & done' </dev/null >/dev/null 2>&1 & echo filling`,
      );
      await check.setup;
      let probeExit: number | null = null;
      await pollUntil(
        async () => {
          probeExit = (await dockerResult(["exec", id, "true"])).exitCode;
          return probeExit === SPAWN_FAILED_EXIT;
        },
        PIDS_FULL_POLL_MS,
        PIDS_FULL_ROUNDS,
      );

      expect(await slotFileExists(id, "a-left"), "I-c8 a-left was written before the restart").toBe(
        true,
      );
      expect(probeExit, "the pids limit is full").toBe(SPAWN_FAILED_EXIT);
      expect(
        await check.terminate({ wait: true }),
        "a cleanup that cannot start resolves not-started with httpStatus 500",
      ).toStrictEqual({ kind: "not-started", exitCode: null, httpStatus: 500 });
      await restartContainer(id, instance);
      expect(
        await uidProcesses(id, 2000),
        "I-c8 no uid-2000 process after the restart",
      ).toStrictEqual([]);
      const next = await startCheck(started, 'ls -A "$ACADEMY_GRADER_SCRATCH"');
      await next.ended;
      expect(
        linesOf(next.stdout().text),
        "the next start of the slot empties what the first check left",
      ).toStrictEqual(["checks", "home", "tmp"]);
      expect(await next.terminate({ wait: true }), "I-c8 B clean").toStrictEqual(CLEAN);
    },
    PIDS_TEST_TIMEOUT_MS,
  );

  it(
    "I-c10: the next check kills what an uncleaned one left",
    async () => {
      const started = await startWorkspace();
      const first = await startCheck(
        started,
        "setsid sleep 300 </dev/null >/dev/null 2>&1 & echo first",
      );
      await first.ended;
      const left = await uidProcesses(started.containerId, 2000);

      const second = await startCheck(started, "echo second");
      await second.setup;
      await second.ended;

      expect(left.length, "the uncleaned check left a process").toBeGreaterThan(0);
      expect(
        await uidProcesses(started.containerId, 2000),
        "after the second check the uid-2000 oracle count is 0",
      ).toStrictEqual([]);
      expect(await second.terminate({ wait: true }), "I-c10 second clean").toStrictEqual(CLEAN);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "I-c11: a module planted in /tmp is not found from a checks file",
    async () => {
      const started = await startWorkspace({ checksFiles: { "probe.cjs": PLANTED_PROBE } });
      const id = started.containerId;
      const moduleDir = "/tmp/node_modules/academy-probe";
      await docker(asLearner(id, ["mkdir", "-p", moduleDir]));
      await docker(
        asLearner(id, ["sh", "-c", `echo "module.exports = 1" > ${moduleDir}/index.js`]),
      );
      const planted = await docker([
        "exec",
        "-u",
        LEARNER_USER,
        "-w",
        "/tmp",
        id,
        "node",
        "-e",
        'require("academy-probe"); console.log("planted")',
      ]);

      expect(planted.trim(), "the planted module loads from below /tmp").toBe("planted");
      const check = await startCheck(started, 'node "$ACADEMY_CHECKS_DIR/probe.cjs"');
      await check.ended;
      expect(check.stdout().text, "stdout is exactly probe-MODULE_NOT_FOUND").toBe(
        "probe-MODULE_NOT_FOUND\n",
      );
      expect(await check.terminate({ wait: true }), "I-c11 clean").toStrictEqual(CLEAN);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "I-c12: no agent key in the environment of a check, and none read from the environment of a terminal shell",
    async () => {
      const started = await startWorkspace({ agentApiKey: "t199-fake-agent-key-not-real" });
      const shell = await started.runtime.openShell(key, { shell: "/bin/sh" });
      onCleanup(() => {
        shell.stream.destroy();
      });
      const holders = await docker(
        asLearner(started.containerId, [
          "sh",
          "-c",
          "grep -l ANTHROPIC_API_KEY /proc/[0-9]*/environ 2>/dev/null | wc -l",
        ]),
      );

      expect(Number(holders.trim()), "terminal probe").toBeGreaterThanOrEqual(1);
      const check = await startCheck(
        started,
        'env | grep -c ANTHROPIC_API_KEY; for f in /proc/[0-9]*/environ; do grep -qs ANTHROPIC_API_KEY "$f" && echo probe-READ; done; echo probe-end',
      );
      await check.ended;
      expect(
        linesOf(check.stdout().text),
        "no key in the check environment, none read from the shell environment",
      ).toStrictEqual(["0", "probe-end"]);
      expect(await check.terminate({ wait: true }), "I-c12 clean").toStrictEqual(CLEAN);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "I-c13: a work dir replaced by a link to the slot dir does not start the check",
    async () => {
      const started = await startWorkspace();
      const first = await startCheck(started, "true");
      await first.ended;
      expect(await first.terminate({ wait: true }), "I-c13 first check clean").toStrictEqual(CLEAN);
      const link = await dockerResult(
        asLearner(started.containerId, [
          "sh",
          "-c",
          `mv /workspace/home/work /workspace/home/work.real && ln -s ${SLOT_SCRATCH} /workspace/home/work`,
        ]),
      );
      expect(link.exitCode, "I-c13 the link is in place").toBe(0);

      const second = await startCheck(started, "true");
      await second.ended;

      expect(
        {
          setup: (await second.setup).kind,
          exitStatus: await settledExitStatus(second),
          stdout: second.stdout().text,
        },
        "a work dir linked to the slot dir ends with 123 before the marker",
      ).toStrictEqual({ setup: "not-started", exitStatus: WORK_DIR_EXIT, stdout: "" });
      expect(await second.terminate({ wait: true }), "I-c13 second clean").toStrictEqual(CLEAN);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "I-c14: terminate resolves clean only when no process of the slot uid is left, against a same-uid killer",
    async () => {
      const started = await startWorkspace();
      const id = started.containerId;
      // The looper also ends this check's own shell, so `ended` comes at once.
      const check = await startCheck(
        started,
        `touch "$ACADEMY_GRADER_SCRATCH/a-left"; setsid sh -c 'while :; do kill -9 -1; done' </dev/null >/dev/null 2>&1 & sleep 30`,
      );
      await check.ended;

      expect(
        await slotFileExists(id, "a-left"),
        "I-c14 a-left was written before the restart",
      ).toBe(true);
      expect(
        (await uidProcesses(id, 2000)).some((entry) => entry.args.includes("kill -9 -1")),
        "the killer runs before terminate",
      ).toBe(true);
      const result = await check.terminate({ wait: true });
      const left = await uidProcesses(id, 2000);
      expect(
        result.kind !== "clean" || left.length === 0,
        "a clean result with a slot-uid process left",
      ).toBe(true);
      expect(CLEANUP_KINDS, "I-c14 result is a known kind").toContain(result.kind);
      await restartContainer(id, instance);
      expect(
        await uidProcesses(id, 2000),
        "I-c14 no uid-2000 process after the restart",
      ).toStrictEqual([]);
      const next = await startCheck(started, 'ls -A "$ACADEMY_GRADER_SCRATCH"');
      await next.ended;
      expect(linesOf(next.stdout().text), "I-c14 next start empties the slot").toStrictEqual([
        "checks",
        "home",
        "tmp",
      ]);
      expect(await next.terminate({ wait: true }), "I-c14 B clean").toStrictEqual(CLEAN);
    },
    PIDS_TEST_TIMEOUT_MS,
  );
});
