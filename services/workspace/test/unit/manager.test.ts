import { describe, expect, it } from "vitest";
import { CourseLessons } from "../../src/course/lessons.js";
import {
  DockerUnavailableError,
  LessonHasNoWorkspaceError,
  LessonNotFoundError,
  WorkspaceNotFoundError,
  WorkspaceNotRunningError,
} from "../../src/errors.js";
import { type WorkspaceKey, workspaceId } from "../../src/identity.js";
import { IdleTracker } from "../../src/idle.js";
import { KeyedMutex } from "../../src/lock.js";
import { type ServiceLog, WorkspaceManager } from "../../src/manager.js";
import { FakeRuntime } from "../support/fake-runtime.js";

// U-manager (design 12.1): the manager's rules against the in-memory runtime (T3).

const INSTANCE = "local";
const MINUTE = 60_000;
const T0 = Date.parse("2026-11-03T10:00:00Z");
const LESSON_IMAGE = "academy-workspace:dev";
const KEY: WorkspaceKey = { userId: "user-1", courseId: "course-a", lessonId: "with-workspace" };
const THEORY_KEY: WorkspaceKey = { ...KEY, lessonId: "theory-only" };
const ID = workspaceId(INSTANCE, KEY);

const COURSE = new CourseLessons([
  {
    courseId: "course-a",
    lessonId: "with-workspace",
    lessonDir: "course-a/01-basics/01-with-workspace",
    workspace: { image: LESSON_IMAGE, starter: "starter" },
    commandChecks: [],
  },
  {
    courseId: "course-a",
    lessonId: "theory-only",
    lessonDir: "course-a/01-basics/02-theory-only",
    workspace: null,
    commandChecks: [],
  },
]);

interface Setup {
  manager: WorkspaceManager;
  runtime: FakeRuntime;
  clock: { now: number };
  courseReads: { count: number };
  mutex: KeyedMutex;
  logged: string[];
}

function setup(
  options: {
    imageOverride?: string | null;
    courseThrows?: boolean;
    courseGate?: Promise<void>;
  } = {},
): Setup {
  const clock = { now: T0 };
  const now = (): number => clock.now;
  const runtime = new FakeRuntime(INSTANCE);
  const courseReads = { count: 0 };
  const mutex = new KeyedMutex();
  const logged: string[] = [];
  const log: ServiceLog = {
    info: (message) => logged.push(message),
    warn: (message) => logged.push(message),
  };
  const manager = new WorkspaceManager({
    runtime,
    readCourse: async () => {
      courseReads.count += 1;
      if (options.courseGate !== undefined) await options.courseGate;
      if (options.courseThrows === true) throw new Error("the course must not be read here");
      return COURSE;
    },
    instance: INSTANCE,
    imageOverride: options.imageOverride ?? null,
    tracker: new IdleTracker({ stopMinutes: 30, warningMinutes: 5, now }),
    mutex,
    log,
    now,
  });
  return { manager, runtime, clock, courseReads, mutex, logged };
}

describe("WorkspaceManager.ensure and get", () => {
  it("resolves the lesson and passes its image and starter to the runtime", async () => {
    const { manager, runtime } = setup();

    const result = await manager.ensure(KEY);

    expect(runtime.specs).toEqual([
      {
        key: KEY,
        image: LESSON_IMAGE,
        starter: { lessonDir: "course-a/01-basics/01-with-workspace", relPath: "starter" },
      },
    ]);
    expect([result.outcome, result.workspace.state]).toEqual(["created", "running"]);
  });

  it("passes the image override instead of the lesson's image", async () => {
    const { manager, runtime } = setup({ imageOverride: "node:22.23.4-alpine" });

    await manager.ensure(KEY);

    expect(runtime.specs[0]?.image).toBe("node:22.23.4-alpine");
  });

  it("refuses a lesson without a workspace before any runtime call", async () => {
    const { manager, runtime } = setup();

    const failure = await manager.ensure(THEORY_KEY).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(LessonHasNoWorkspaceError);
    expect(runtime.calls).toEqual([]);
  });

  it("refuses a lesson the course does not have", async () => {
    const { manager, runtime } = setup();

    const failure = await manager
      .ensure({ ...KEY, lessonId: "no-such-lesson" })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(LessonNotFoundError);
    expect(runtime.calls).toEqual([]);
  });

  it("touches the idle tracker, so the view carries the stop and warning times", async () => {
    const { manager } = setup();

    const result = await manager.ensure(KEY);

    expect(result.workspace.idle).toEqual({
      stopAt: T0 + 30 * MINUTE,
      warningAt: T0 + 25 * MINUTE,
    });
  });

  it("gets a running workspace with its idle window, and refuses one that does not exist", async () => {
    const { manager } = setup();
    const missing = await manager.get(KEY).catch((error: unknown) => error);
    await manager.ensure(KEY);

    const view = await manager.get(KEY);

    expect(missing).toBeInstanceOf(WorkspaceNotFoundError);
    expect([view.id, view.state, view.idle?.stopAt]).toEqual([ID, "running", T0 + 30 * MINUTE]);
  });
});

describe("WorkspaceManager.stop, remove and activity", () => {
  it("stops a running workspace and forgets its idle entry", async () => {
    const { manager } = setup();
    await manager.ensure(KEY);

    const view = await manager.stop(KEY);
    const activity = (() => {
      try {
        manager.activity(KEY);
        return null;
      } catch (error: unknown) {
        return error;
      }
    })();

    expect([view.state, view.idle]).toEqual(["stopped", null]);
    expect(activity).toBeInstanceOf(WorkspaceNotRunningError);
  });

  it("removes a workspace and forgets its idle entry", async () => {
    const { manager, runtime } = setup();
    await manager.ensure(KEY);

    await manager.remove(KEY);

    expect(runtime.calls).toContain(`remove ${ID}`);
    expect(() => manager.activity(KEY)).toThrow(WorkspaceNotRunningError);
  });

  it("refuses activity on an untracked workspace without asking the runtime", () => {
    const { manager, runtime } = setup();

    expect(() => manager.activity(KEY)).toThrow(WorkspaceNotRunningError);
    expect(runtime.calls).toEqual([]);
  });

  it("moves the idle window on activity", async () => {
    const { manager, clock } = setup();
    await manager.ensure(KEY);
    clock.now = T0 + 10 * MINUTE;

    manager.activity(KEY);

    expect((await manager.get(KEY)).idle?.stopAt).toBe(T0 + 40 * MINUTE);
  });

  it("runs a delete that arrives after an ensure only once that ensure is done, however slow the course read", async () => {
    let releaseCourse = (): void => {};
    const courseGate = new Promise<void>((resolve) => {
      releaseCourse = resolve;
    });
    const { manager, runtime } = setup({ courseGate });

    const ensured = manager.ensure(KEY);
    const removed = manager.remove(KEY);
    releaseCourse();
    await Promise.all([ensured, removed]);

    expect(runtime.calls).toEqual([`ensureRunning ${ID}`, `remove ${ID}`]);
  });

  it("never reads the course for get, stop and delete", async () => {
    const { manager, runtime, courseReads } = setup({ courseThrows: true });
    runtime.seed({
      id: ID,
      key: KEY,
      state: "running",
      containerId: "c1",
      image: LESSON_IMAGE,
      exit: null,
    });

    await manager.get(KEY);
    await manager.stop(KEY);
    await manager.remove(KEY);

    expect(courseReads.count).toBe(0);
  });
});

describe("WorkspaceManager.sweepIdle", () => {
  it("stops a workspace whose idle time is up and forgets it", async () => {
    const { manager, runtime, clock } = setup();
    await manager.ensure(KEY);
    clock.now = T0 + 30 * MINUTE;

    await manager.sweepIdle();

    expect(runtime.calls).toContain(`stop ${ID}`);
    expect((await manager.get(KEY)).state).toBe("stopped");
    expect(() => manager.activity(KEY)).toThrow(WorkspaceNotRunningError);
  });

  it("skips a workspace touched while the sweep waited for its lock", async () => {
    const { manager, runtime, clock, mutex } = setup();
    await manager.ensure(KEY);
    clock.now = T0 + 30 * MINUTE;
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const held = mutex.run(manager.lockKey(KEY), () => gate);

    const sweep = manager.sweepIdle();
    manager.activity(KEY);
    release();
    await held;
    await sweep;

    expect(runtime.calls).not.toContain(`stop ${ID}`);
    expect((await manager.get(KEY)).state).toBe("running");
  });

  it("keeps the entry for a retry when Docker is unavailable, and logs the failure", async () => {
    const { manager, runtime, clock, logged } = setup();
    await manager.ensure(KEY);
    clock.now = T0 + 30 * MINUTE;
    runtime.stop = async () => {
      throw new DockerUnavailableError("stop container", "ECONNREFUSED");
    };

    await manager.sweepIdle();

    expect(logged).toEqual([`idle stop failed: ${ID}: DockerUnavailableError`]);
    expect(() => manager.activity(KEY)).not.toThrow();
  });

  it.each([
    [
      "a class with an empty name",
      () => new (Object.defineProperty(class extends Error {}, "name", { value: "" }))("x"),
    ],
    [
      "an Error whose constructor getter throws",
      () =>
        Object.defineProperty(new Error("x"), "constructor", {
          get: () => {
            throw new Error("canary");
          },
        }),
    ],
  ])("logs a hostile stop failure as Error and forgets the entry (%s)", async (_case, hostile) => {
    const { manager, runtime, clock, logged } = setup();
    await manager.ensure(KEY);
    clock.now = T0 + 30 * MINUTE;
    runtime.stop = async () => {
      throw hostile();
    };

    await expect(manager.sweepIdle()).resolves.toBeUndefined();

    expect(logged).toEqual([`idle stop failed: ${ID}: Error`]);
    expect(() => manager.activity(KEY)).toThrow(WorkspaceNotRunningError);
  });
});
