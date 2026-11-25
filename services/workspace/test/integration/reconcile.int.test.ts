import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readCourseById, readEveryCourse } from "../../src/course/lessons.js";
import { DockerEngine } from "../../src/docker/engine.js";
import { DockerRuntime } from "../../src/docker/runtime.js";
import {
  LABEL,
  LABEL_SCHEMA,
  type WorkspaceKey,
  workspaceId,
  workspaceLabels,
  workspaceNames,
} from "../../src/identity.js";
import { IdleTracker } from "../../src/idle.js";
import { KeyedMutex } from "../../src/lock.js";
import { type ServiceLog, WorkspaceManager } from "../../src/manager.js";
import { Reconciler } from "../../src/reconcile.js";
import {
  createIdleContainer,
  createVolume,
  docker,
  inspectObject,
  runIdleContainer,
  TEST_IMAGE,
} from "./docker-cli.js";
import { FIXTURE_COURSE_ROOT, STOP_SECONDS, TEST_LIMITS } from "./fixtures.js";
import { runLabels, useTestInstance } from "./harness.js";

// Reconcile on real Docker (design 6.5, 12.2): a second service process over the objects the first one and the
// harness left, and the GC predicate where the fake runtime cannot check it.

const { runId, instance, decoyInstance } = useTestInstance("reconcile.int.test.ts");

const MINUTE = 60_000;
const T0 = Date.parse("2026-11-03T10:00:00Z");
const ID_BYTES = 10;

function key(userId: string, lessonId = "with-workspace"): WorkspaceKey {
  return { userId, courseId: "sample-course", lessonId };
}

/** A course root that lists no course: every pass over it is a root failure. */
let emptyRoot = "";

beforeAll(async () => {
  emptyRoot = await mkdtemp(join(tmpdir(), "reconcile-int-root-"));
});

afterAll(async () => {
  await rm(emptyRoot, { recursive: true, force: true });
});

interface Service {
  manager: WorkspaceManager;
  reconciler: Reconciler;
  tracker: IdleTracker;
  clock: { now: number };
}

/** One service process: its own memory (tracker, locks), the shared Docker objects. */
function startService(courseRoot: string = FIXTURE_COURSE_ROOT): Service {
  const clock = { now: T0 };
  const now = (): number => clock.now;
  const runtime = new DockerRuntime({
    engine: new DockerEngine(),
    instance,
    courseRoot,
    limits: TEST_LIMITS,
    agentApiKey: null,
  });
  const tracker = new IdleTracker({ stopMinutes: 30, warningMinutes: 5, now });
  const mutex = new KeyedMutex();
  const log: ServiceLog = { info: () => {}, warn: () => {} };
  const readCourse = (courseId: string) => readCourseById(courseRoot, courseId);
  const readCourses = () => readEveryCourse(courseRoot);
  const manager = new WorkspaceManager({
    runtime,
    readCourse,
    instance,
    imageOverride: TEST_IMAGE,
    tracker,
    mutex,
    log,
    now,
  });
  const reconciler = new Reconciler({ runtime, readCourses, instance, tracker, mutex, log });
  return { manager, reconciler, tracker, clock };
}

function containerName(workspaceKey: WorkspaceKey): string {
  return workspaceNames(instance, workspaceId(instance, workspaceKey)).container;
}

function withRunLabel(labels: Readonly<Record<string, string>>): Record<string, string> {
  return { ...labels, ...runLabels(runId) };
}

/** Managed and of `owner`, without the key labels: parses `invalid`. */
function invalidLabels(owner: string): Record<string, string> {
  return withRunLabel({
    [LABEL.managed]: "true",
    [LABEL.instance]: owner,
    [LABEL.schema]: LABEL_SCHEMA,
    [LABEL.role]: "container",
  });
}

function randomName(): string {
  return `wks-${instance}-${randomBytes(ID_BYTES).toString("hex")}`;
}

async function stateOf(ref: string): Promise<string | null> {
  return (await inspectObject("container", ref))?.state ?? null;
}

describe("reconcile after a restart", () => {
  it("I-restart: adopts and idle-stops running workspaces, removes a stopped orphan, keeps a running one until idle stop", async () => {
    const first = startService();
    const workspaces = [key("restart-a"), key("restart-b")];
    for (const workspaceKey of workspaces) await first.manager.ensure(workspaceKey);
    const runningOrphan = key("orphan-running", "removed-lesson");
    const stoppedOrphan = key("orphan-stopped", "removed-lesson");
    await runIdleContainer(
      containerName(runningOrphan),
      withRunLabel(workspaceLabels(instance, runningOrphan, "container")),
    );
    const stoppedId = await runIdleContainer(
      containerName(stoppedOrphan),
      withRunLabel(workspaceLabels(instance, stoppedOrphan, "container")),
    );
    await docker(["stop", "-t", String(STOP_SECONDS), stoppedId]);
    const stoppedVolume = `${containerName(stoppedOrphan)}-files`;
    await createVolume(
      stoppedVolume,
      withRunLabel(workspaceLabels(instance, stoppedOrphan, "volume")),
    );
    const decoy = await runIdleContainer(
      randomName(),
      withRunLabel(workspaceLabels(decoyInstance, key("decoy"), "container")),
    );
    const runLabelOnly = await runIdleContainer(`wks-${instance}-x`, runLabels(runId));
    const second = startService();

    await second.reconciler.runPass();
    const afterPass = {
      stoppedOrphan: await stateOf(stoppedId),
      stoppedVolume: (await inspectObject("volume", stoppedVolume))?.name ?? null,
      tracked: [...workspaces, runningOrphan].map((workspaceKey) =>
        second.tracker.isTracked(workspaceId(instance, workspaceKey)),
      ),
    };
    second.clock.now = T0 + 30 * MINUTE;
    await second.manager.sweepIdle();

    expect(afterPass).toEqual({
      stoppedOrphan: null,
      stoppedVolume,
      tracked: [true, true, true],
    });
    for (const workspaceKey of [...workspaces, runningOrphan]) {
      expect(await stateOf(containerName(workspaceKey))).toBe("exited");
    }
    expect([await stateOf(decoy), await stateOf(runLabelOnly)]).toEqual(["running", "running"]);
  });

  it("I-reconcile-invalid (passes): stops a running invalid container, removes a never-started one, then the stopped one", async () => {
    const service = startService();
    const running = await runIdleContainer(randomName(), invalidLabels(instance));
    const neverStarted = await createIdleContainer(randomName(), invalidLabels(instance));
    const decoy = await runIdleContainer(randomName(), invalidLabels(decoyInstance));

    await service.reconciler.runPass();
    const afterFirst = [await stateOf(running), await stateOf(neverStarted), await stateOf(decoy)];
    await service.reconciler.runPass();
    const afterSecond = [await stateOf(running), await stateOf(decoy)];

    expect(afterFirst).toEqual(["exited", null, "running"]);
    expect(afterSecond).toEqual([null, "running"]);
  });

  it("I-reconcile-invalid (root failure): stops the running invalid container and removes nothing", async () => {
    const service = startService(emptyRoot);
    const running = await runIdleContainer(randomName(), invalidLabels(instance));
    const neverStarted = await createIdleContainer(randomName(), invalidLabels(instance));

    await service.reconciler.runPass();

    expect([await stateOf(running), await stateOf(neverStarted)]).toEqual(["exited", "created"]);
  });
});
