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
import type { WorkspaceKey } from "../../src/identity.js";
import type { CheckProcess, ExitStatus } from "../../src/runtime.js";
import { docker } from "./docker-cli.js";
import { FIXTURE_COURSE_ROOT, FIXTURE_LESSON_DIR, fixtureSpec, TEST_LIMITS } from "./fixtures.js";
import { onCleanup, useTestInstance } from "./harness.js";

// Check execs on the real daemon, each ending by itself: a deleted work dir stops the setup with exit 123 before the
// marker, the slot's next start removes what an unterminated run left in its scratch, and the grader's HOME and
// TMPDIR are new dirs in the slot's scratch, not the learner's.

const { instance } = useTestInstance("checks-exec.int.test.ts");

const key: WorkspaceKey = {
  userId: "check-user",
  courseId: "sample-course",
  lessonId: "with-workspace",
};
const TEST_TIMEOUT_MS = 40_000;
/** The attach stream's end and Docker's record of the exit code are two events; this bounds the gap at 2 s. */
const EXIT_STATUS_READS = 20;
const EXIT_STATUS_POLL_MS = 100;
const LEARNER_USER = "1000:1000";
/** Slot 0's uid, and so its scratch dir under the grader root. */
const SLOT_SCRATCH = "/workspace/.academy-grader/2000";
/** The work dir exit code of the check setup. */
const WORK_DIR_EXIT = 123;

interface Started {
  runtime: DockerRuntime;
  containerId: string;
  checksTar: Buffer;
}

/**
 * A running workspace on a copy of the fixture course whose checks hold a random canary, and the checks tar read
 * from it as the check runner reads it.
 */
async function startWorkspace(): Promise<Started> {
  const root = await mkdtemp(join(tmpdir(), "wks-checks-"));
  onCleanup(() => rm(root, { recursive: true, force: true }));
  await cp(FIXTURE_COURSE_ROOT, root, { recursive: true });
  await writeFile(
    join(root, FIXTURE_LESSON_DIR, "checks", "secret.txt"),
    `${randomBytes(16).toString("hex")}\n`,
  );
  const checksTar = await buildChecksTar(await loadChecks(root, FIXTURE_LESSON_DIR), new Date());
  const runtime = new DockerRuntime({
    engine: new DockerEngine(),
    instance,
    courseRoot: root,
    limits: TEST_LIMITS,
    agentApiKey: null,
  });
  const containerId = (await runtime.ensureRunning(fixtureSpec(key))).workspace.containerId;
  if (containerId === null) throw new Error("ensureRunning returned no container");
  return { runtime, containerId, checksTar };
}

async function startCheck(started: Started, run: string): Promise<CheckProcess> {
  return started.runtime.startCheck({ key, checksTar: started.checksTar, run, slot: 0 });
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
