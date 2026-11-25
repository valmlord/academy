import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type EveryCourse, readEveryCourse } from "../../src/course/lessons.js";
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
import { FIXTURE_ROOT, twoCourseRoot } from "../support/course-root.js";
import { FakeRuntime } from "../support/fake-runtime.js";

// U-reconcile, apply (design 6.5): what one pass does through the GC primitives and the idle tracker, against
// the in-memory runtime, with the real course reader on the fixture course or a two-course copy of it.

const INSTANCE = "local";
const KEY: WorkspaceKey = {
  userId: "user-1",
  courseId: "sample-course",
  lessonId: "with-workspace",
};
const GONE_KEY: WorkspaceKey = { ...KEY, lessonId: "removed-lesson" };
const OTHER_USER_KEY: WorkspaceKey = { ...KEY, userId: "user-2" };
const OTHER_COURSE_KEY: WorkspaceKey = { ...KEY, courseId: "other-course" };
const FAILED = "reconcile: course read failed: ";

/** A lesson that breaks the schema with a duplicate check id: its whole course is unreadable (U-lessons). */
const DUPLICATE_CHECK_IDS = [
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

/** Two-course roots made by a test, removed after it. */
const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function twoCourses(): Promise<string> {
  const root = await twoCourseRoot();
  roots.push(root);
  return root;
}

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

function setup(
  containers: readonly ManagedContainer[],
  readCourses: () => Promise<EveryCourse> = () => readEveryCourse(FIXTURE_ROOT),
): Setup {
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
    readCourses,
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

  it("leaves the idle entry of a workspace listed as exited, which an ensure may have started since the listing", async () => {
    const { reconciler, runtime, tracker } = setup([workspaceContainer(KEY, "exited")]);
    tracker.touch(workspaceId(INSTANCE, KEY), KEY);

    await reconciler.runPass();

    expect(actions(runtime)).toEqual([]);
    expect(tracker.isTracked(workspaceId(INSTANCE, KEY))).toBe(true);
  });

  it("with one course failing: keeps its stopped containers, removes another course's gone lesson", async () => {
    const root = await twoCourses();
    await writeFile(
      join(root, "other-course/01-basics/02-theory-only/lesson.yaml"),
      DUPLICATE_CHECK_IDS,
    );
    const gone = workspaceContainer(GONE_KEY, "exited");
    const { reconciler, runtime } = setup(
      [
        workspaceContainer(OTHER_COURSE_KEY, "exited"),
        workspaceContainer({ ...OTHER_COURSE_KEY, userId: "user-2" }, "dead"),
        gone,
      ],
      () => readEveryCourse(root),
    );

    await reconciler.runPass();

    expect(actions(runtime)).toEqual([`removeContainer ${gone.containerId}`]);
  });

  it("with one course failing: removes a stopped invalid container", async () => {
    const root = await twoCourses();
    await rm(join(root, "other-course/course.yaml"));
    const { reconciler, runtime } = setup(
      [invalidContainer("a", "exited"), invalidContainer("b", "running")],
      () => readEveryCourse(root),
    );

    await reconciler.runPass();

    expect(actions(runtime)).toEqual([
      "removeContainer docker-invalid-a",
      "stopContainer docker-invalid-b",
    ]);
  });

  it("logs one line per failing course on every pass, root failures and course failures apart", async () => {
    const root = await twoCourses();
    await rm(join(root, "other-course/course.yaml"));
    await writeFile(
      join(root, "sample-course/01-basics/02-theory-only/lesson.yaml"),
      DUPLICATE_CHECK_IDS,
    );
    const { reconciler, logged } = setup([], () => readEveryCourse(root));

    await reconciler.runPass();
    await reconciler.runPass();

    const other = `${FAILED}course other-course: other-course/course.yaml: missing`;
    const sample = `${FAILED}course sample-course: sample-course/01-basics/02-theory-only/lesson.yaml: schema: checks custom`;
    expect(logged.filter((line) => line.startsWith(FAILED))).toEqual([
      other,
      sample,
      other,
      sample,
    ]);
  });

  it("a root failure removes nothing and logs the root line", async () => {
    const root = await twoCourses();
    await rm(root, { recursive: true, force: true });
    const { reconciler, runtime, tracker, logged } = setup(
      [
        workspaceContainer(KEY, "running"),
        workspaceContainer(GONE_KEY, "exited"),
        workspaceContainer(OTHER_USER_KEY, "dead"),
        invalidContainer("a", "exited"),
        invalidContainer("b", "running"),
      ],
      () => readEveryCourse(root),
    );

    await reconciler.runPass();

    expect(actions(runtime)).toEqual(["stopContainer docker-invalid-b"]);
    expect(tracker.isTracked(workspaceId(INSTANCE, KEY))).toBe(true);
    expect(logged.filter((line) => line.startsWith(FAILED))).toEqual([`${FAILED}root: .: missing`]);
  });

  it("a throw that is not a read error removes nothing and logs its kind", async () => {
    const { reconciler, runtime, logged } = setup([invalidContainer("a", "exited")], () =>
      Promise.reject(new Error("x INJECT")),
    );

    await expect(reconciler.runPass()).resolves.toBeUndefined();

    expect(actions(runtime)).toEqual([]);
    expect(logged).toContain(`${FAILED}Error`);
    expect(logged.join("\n")).not.toContain("INJECT");
  });

  it("a non-slug directory is logged JSON-quoted", async () => {
    const root = await twoCourses();
    await mkdir(join(root, "Bad\nName"));
    const { reconciler, logged } = setup([], () => readEveryCourse(root));

    await reconciler.runPass();

    expect(logged.filter((line) => line.startsWith(FAILED))).toEqual([
      `${FAILED}course "Bad\\nName": .: directory name is not a course id`,
    ]);
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

describe("Reconciler.runPass with a hostile error (#121)", () => {
  it.each([
    [
      "a class named with a newline",
      () =>
        new (Object.defineProperty(class extends Error {}, "name", { value: "Evil\nINJECT" }))("x"),
    ],
    [
      "a class whose name getter throws",
      () =>
        new (Object.defineProperty(class extends Error {}, "name", {
          get: () => {
            throw new Error("INJECT");
          },
        }))("x"),
    ],
  ])("logs the failure as Error and still resolves (%s)", async (_case, hostile) => {
    const container = invalidContainer("a", "exited");
    const { reconciler, runtime, logged } = setup([container]);
    runtime.setGcBehaviour(container.containerId, hostile());

    await expect(reconciler.runPass()).resolves.toBeUndefined();

    expect(logged).toContain(`reconcile: ${container.containerId}: Error`);
    expect(logged.join("\n")).not.toContain("INJECT");
  });
});
