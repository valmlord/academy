import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readCourseLessons } from "../../src/course/lessons.js";
import { WorkspaceIdentityMismatchError } from "../../src/errors.js";
import {
  LABEL,
  type WorkspaceKey,
  workspaceId,
  workspaceLabels,
  workspaceNames,
} from "../../src/identity.js";
import { IdleTracker } from "../../src/idle.js";
import { KeyedMutex } from "../../src/lock.js";
import type { ServiceLog } from "../../src/manager.js";
import { Reconciler } from "../../src/reconcile.js";
import type { ManagedContainer } from "../../src/runtime.js";
import { FakeRuntime } from "../support/fake-runtime.js";

// U-reconcile, apply (design 6.5): what one pass does through the GC primitives and the idle tracker, against
// the in-memory runtime, with the real course reader on the fixture course.

const INSTANCE = "local";
const FIXTURE = fileURLToPath(new URL("../fixtures/course", import.meta.url));
const THEORY_LESSON = "sample-course/01-basics/02-theory-only/lesson.yaml";
const KEY: WorkspaceKey = {
  userId: "user-1",
  courseId: "sample-course",
  lessonId: "with-workspace",
};
const GONE_KEY: WorkspaceKey = { ...KEY, lessonId: "removed-lesson" };
const OTHER_USER_KEY: WorkspaceKey = { ...KEY, userId: "user-2" };

/** The fixture course with one lesson that breaks the schema: the whole course is unreadable (U-lessons). */
let brokenCourseRoot = "";

beforeAll(async () => {
  brokenCourseRoot = await mkdtemp(join(tmpdir(), "reconcile-course-"));
  await cp(FIXTURE, brokenCourseRoot, { recursive: true });
  const duplicateCheckIds = [
    "id: theory-only",
    "title: Invalid",
    "type: theory",
    "outcomes: [x]",
    "estimatedMinutes: 5",
    "status: draft",
    "checks:",
    "  - { id: dup, title: a, kind: bug-hunt, answers: a.yaml, minFound: 1 }",
    "  - { id: dup, title: b, kind: bug-hunt, answers: b.yaml, minFound: 1 }",
    "",
  ].join("\n");
  await writeFile(join(brokenCourseRoot, THEORY_LESSON), duplicateCheckIds);
});

afterAll(async () => {
  await rm(brokenCourseRoot, { recursive: true, force: true });
});

function workspaceContainer(key: WorkspaceKey, state: string): ManagedContainer {
  const id = workspaceId(INSTANCE, key);
  return {
    containerId: `docker-${id}`,
    name: workspaceNames(INSTANCE, id).container,
    labels: workspaceLabels(INSTANCE, key, "container"),
    state,
  };
}

function invalidContainer(suffix: string, state: string): ManagedContainer {
  return {
    containerId: `docker-invalid-${suffix}`,
    name: `wks-local-invalid-${suffix}`,
    labels: { [LABEL.managed]: "true", [LABEL.instance]: INSTANCE, [LABEL.schema]: "1" },
    state,
  };
}

function otherSchemaContainer(state: string): ManagedContainer {
  const base = workspaceContainer(OTHER_USER_KEY, state);
  return { ...base, labels: { ...base.labels, [LABEL.schema]: "2" } };
}

interface Setup {
  reconciler: Reconciler;
  runtime: FakeRuntime;
  tracker: IdleTracker;
  logged: string[];
}

function setup(containers: readonly ManagedContainer[], courseRoot: string = FIXTURE): Setup {
  const runtime = new FakeRuntime(INSTANCE);
  runtime.setManaged(containers);
  const tracker = new IdleTracker({ stopMinutes: 30, warningMinutes: 5, now: () => 0 });
  const logged: string[] = [];
  const log: ServiceLog = {
    info: (message) => logged.push(message),
    warn: (message) => logged.push(message),
  };
  const reconciler = new Reconciler({
    runtime,
    readCourse: () => readCourseLessons(courseRoot),
    instance: INSTANCE,
    tracker,
    mutex: new KeyedMutex(),
    log,
  });
  return { reconciler, runtime, tracker, logged };
}

/** The GC primitive calls of a pass, without the listings. */
function actions(runtime: FakeRuntime): string[] {
  return runtime.calls.filter((call) => !call.startsWith("list"));
}

describe("Reconciler.runPass", () => {
  it("removes a stopped container with invalid labels and stops a running one", async () => {
    const { reconciler, runtime } = setup([
      invalidContainer("a", "exited"),
      invalidContainer("b", "running"),
    ]);

    await reconciler.runPass();

    expect(actions(runtime)).toEqual([
      "removeContainer docker-invalid-a",
      "stopContainer docker-invalid-b",
    ]);
  });

  it("keeps an other-schema container, running or not, and logs each once across two passes", async () => {
    const running = otherSchemaContainer("running");
    const stopped = { ...otherSchemaContainer("exited"), containerId: "docker-other-stopped" };
    const { reconciler, runtime, logged } = setup([running, stopped]);

    await reconciler.runPass();
    await reconciler.runPass();

    expect(actions(runtime)).toEqual([]);
    expect(logged.filter((line) => line.includes("label schema 2"))).toHaveLength(2);
  });

  it("removes a stopped container of a lesson gone and keeps a running one, adopted into idle tracking", async () => {
    const running = workspaceContainer(GONE_KEY, "running");
    const stopped = {
      ...workspaceContainer(GONE_KEY, "exited"),
      containerId: "docker-gone-stopped",
    };
    const { reconciler, runtime, tracker } = setup([running, stopped]);

    await reconciler.runPass();

    expect(actions(runtime)).toEqual(["removeContainer docker-gone-stopped"]);
    expect(tracker.isTracked(workspaceId(INSTANCE, GONE_KEY))).toBe(true);
  });

  it("removes a dead container", async () => {
    const { reconciler, runtime } = setup([workspaceContainer(KEY, "dead")]);

    await reconciler.runPass();

    expect(actions(runtime)).toEqual([`removeContainer docker-${workspaceId(INSTANCE, KEY)}`]);
  });

  it("keeps valid workspaces and seeds idle tracking for the running ones only", async () => {
    const { reconciler, runtime, tracker } = setup([
      workspaceContainer(KEY, "running"),
      workspaceContainer(OTHER_USER_KEY, "exited"),
    ]);

    await reconciler.runPass();

    expect(actions(runtime)).toEqual([]);
    expect(tracker.isTracked(workspaceId(INSTANCE, KEY))).toBe(true);
    expect(tracker.isTracked(workspaceId(INSTANCE, OTHER_USER_KEY))).toBe(false);
  });

  it("with one invalid lesson in the course: removes nothing, still adopts running workspaces and stops invalid ones", async () => {
    const { reconciler, runtime, tracker, logged } = setup(
      [
        workspaceContainer(KEY, "running"),
        workspaceContainer(GONE_KEY, "exited"),
        invalidContainer("a", "exited"),
        invalidContainer("b", "running"),
      ],
      brokenCourseRoot,
    );

    await reconciler.runPass();

    expect(tracker.isTracked(workspaceId(INSTANCE, KEY))).toBe(true);
    expect(actions(runtime)).toEqual(["stopContainer docker-invalid-b"]);
    expect(logged).toContainEqual(
      expect.stringMatching(
        /^course unreadable: sample-course\/01-basics\/02-theory-only\/lesson\.yaml: schema: /,
      ),
    );
  });

  it("never removes a volume, and logs one without a container once across two passes", async () => {
    const container = workspaceContainer(KEY, "exited");
    const { reconciler, runtime, logged } = setup([container]);
    runtime.setManagedVolumes([
      { name: `${container.name}-files`, labels: {} },
      { name: "wks-local-orphan-files", labels: {} },
    ]);

    await reconciler.runPass();
    await reconciler.runPass();

    expect(runtime.calls.filter((call) => call.startsWith("remove "))).toEqual([]);
    expect(logged.filter((line) => line.includes("volume without container"))).toEqual([
      "reconcile: volume without container: wks-local-orphan-files",
    ]);
  });

  it("leaves a container that is running again on re-inspect, and handles the next one after a mismatch", async () => {
    const first = invalidContainer("a", "exited");
    const second = invalidContainer("b", "exited");
    const third = invalidContainer("c", "exited");
    const { reconciler, runtime, logged } = setup([first, second, third]);
    runtime.setGcBehaviour(first.containerId, "state-changed");
    runtime.setGcBehaviour(
      second.containerId,
      new WorkspaceIdentityMismatchError(second.containerId),
    );

    await reconciler.runPass();

    expect(actions(runtime)).toEqual([
      "removeContainer docker-invalid-a",
      "removeContainer docker-invalid-b",
      "removeContainer docker-invalid-c",
    ]);
    expect(logged).toContain(
      "reconcile: remove wks-local-invalid-a (invalid-labels), volume kept: state-changed",
    );
    expect(logged).toContain("reconcile: docker-invalid-b: WorkspaceIdentityMismatchError");
    expect(logged).toContain(
      "reconcile: remove wks-local-invalid-c (invalid-labels), volume kept: done",
    );
  });
});
