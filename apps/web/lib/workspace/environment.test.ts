// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { nodeCourseFs } from "@/lib/course/node-fs";
import { type CourseTree, readCourse } from "@/lib/course/read";
import type { StartedLesson } from "@/lib/progress/lesson-started";
import type { SessionData } from "@/lib/session-reader";
import type { TicketRequest } from "@/lib/terminal/mint";
import { type CourseFixture, createCourseFixture, FIXTURE_COURSE_ID } from "@/test/course-fixture";
import {
  fakeWorkspaceClient,
  NO_SLEEP,
  UnexpectedWorkspaceCallError,
} from "@/test/workspace-fakes";
import type {
  ActivityAnswer,
  RemoveAnswer,
  Workspace,
  WorkspaceAnswer,
  WorkspaceClient,
  WorkspaceKey,
} from "./client";
import { createEnvironmentActions } from "./environment";

// The environment actions' logic (#32 design 3.3 layer 1, 3.6): the session first, the key from the session's
// own user id, the lesson checked against the course, and each service answer mapped to a state.

let fixture: CourseFixture;
let course: CourseTree;

beforeAll(async () => {
  fixture = createCourseFixture();
  // With a workspace section, so only its draft status can make it unavailable.
  fixture.write(
    "course/00-basics/03-draft/lesson.yaml",
    "id: draft-lesson\ntitle: Draft lesson\ntype: theory\noutcomes:\n  - Not yet.\nestimatedMinutes: 5\nstatus: draft\nworkspace: {}\n",
  );
  course = await readCourse(nodeCourseFs, fixture.root);
});

afterAll(() => {
  fixture.remove();
});

// second-lesson is the fixture's visible lesson with a workspace section.
const LESSON = "second-lesson";

// The fixed clock of these tests; sessions expire a day after it unless a test says otherwise.
const NOW = Date.UTC(2026, 10, 4, 12, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

function session(
  userId: string,
  expiresAt: Date | string = new Date(NOW + DAY_MS),
): () => Promise<SessionData | null> {
  const data: SessionData = {
    user: { id: userId, email: "learner@example.com" },
    session: { expiresAt: new Date(NOW + DAY_MS) },
  };
  // A string stands for what a cache may hand back at runtime despite the declared Date.
  Reflect.set(data.session, "expiresAt", expiresAt);
  return async () => data;
}

function workspace(change: Partial<Workspace>): Workspace {
  return {
    id: "0123456789abcdef0123",
    userId: "user_a",
    courseId: FIXTURE_COURSE_ID,
    lessonId: LESSON,
    state: "running",
    image: "node:22.23.4-alpine",
    idle: null,
    exit: null,
    limits: { nanoCpus: 2_000_000_000, memoryBytes: 2_147_483_648, pidsLimit: 512 },
    ...change,
  };
}

function setup(answer: WorkspaceAnswer, getCourse = async () => course) {
  const calls: { method: "get" | "ensure"; key: WorkspaceKey }[] = [];
  const client = fakeWorkspaceClient({
    get: async (key) => {
      calls.push({ method: "get", key });
      return answer;
    },
    ensure: async (key) => {
      calls.push({ method: "ensure", key });
      return answer;
    },
  });
  const mintTicket = vi.fn((_request: TicketRequest) => ({ ticket: "minted", renewInMs: 1 }));
  const started: StartedLesson[] = [];
  const recordStarted = vi.fn(async (lesson: StartedLesson) => {
    started.push(lesson);
  });
  const log = vi.fn((_line: string) => {});
  const actions = createEnvironmentActions({
    getCourse,
    client,
    mintTicket,
    now: () => NOW,
    recordStarted,
    log,
    sleep: NO_SLEEP,
  });
  return { actions, calls, mintTicket, started, recordStarted, log };
}

describe("environment actions", () => {
  it("builds the key from the session user, never from the arguments", async () => {
    const { actions, calls } = setup({ kind: "workspace", workspace: workspace({}) });

    await actions.peekEnvironment(session("user_a"), FIXTURE_COURSE_ID, LESSON);

    expect(calls).toEqual([
      { method: "get", key: { userId: "user_a", courseId: FIXTURE_COURSE_ID, lessonId: LESSON } },
    ]);
  });

  it("answers unauthenticated without a session and calls nothing", async () => {
    const getCourse = vi.fn(async () => course);
    const { actions, calls } = setup({ kind: "failed" }, getCourse);

    const result = await actions.startEnvironment(async () => null, FIXTURE_COURSE_ID, LESSON);

    expect(result).toEqual({ kind: "unauthenticated" });
    expect(getCourse).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it.each([
    { case: "a lesson without workspace", courseId: FIXTURE_COURSE_ID, lessonId: "first-lesson" },
    { case: "a draft lesson", courseId: FIXTURE_COURSE_ID, lessonId: "draft-lesson" },
    { case: "an unknown lesson", courseId: FIXTURE_COURSE_ID, lessonId: "no-such-lesson" },
    { case: "another course", courseId: "other-course", lessonId: LESSON },
    { case: "a non-string lesson id", courseId: FIXTURE_COURSE_ID, lessonId: ["second-lesson"] },
  ])("answers failed for $case without calling the service", async ({ courseId, lessonId }) => {
    const { actions, calls } = setup({ kind: "workspace", workspace: workspace({}) });

    const result = await actions.startEnvironment(session("user_a"), courseId, lessonId);

    expect(result).toEqual({ kind: "failed" });
    expect(calls).toEqual([]);
  });

  it("answers failed for a session user id the service would refuse", async () => {
    const { actions, calls } = setup({ kind: "workspace", workspace: workspace({}) });

    const result = await actions.startEnvironment(session("user/a"), FIXTURE_COURSE_ID, LESSON);

    expect(result).toEqual({ kind: "failed" });
    expect(calls).toEqual([]);
  });

  it("answers failed when the course cannot be read", async () => {
    const { actions, calls } = setup({ kind: "failed" }, async () => {
      throw new Error("course read failed");
    });

    const result = await actions.peekEnvironment(session("user_a"), FIXTURE_COURSE_ID, LESSON);

    expect(result).toEqual({ kind: "failed" });
    expect(calls).toEqual([]);
  });

  it.each<[string, WorkspaceAnswer, unknown]>([
    [
      "running",
      { kind: "workspace", workspace: workspace({}) },
      { kind: "running", outcome: null },
    ],
    [
      "stopped",
      {
        kind: "workspace",
        workspace: workspace({ state: "stopped", exit: { code: 0, reason: "exited" } }),
      },
      { kind: "stopped" },
    ],
    [
      "stopped by the memory limit",
      {
        kind: "workspace",
        workspace: workspace({ state: "stopped", exit: { code: 137, reason: "memory-limit" } }),
      },
      { kind: "limits" },
    ],
    ["never created", { kind: "not-found" }, { kind: "absent" }],
    ["Docker down", { kind: "docker-down" }, { kind: "docker-down" }],
    [
      "image missing",
      { kind: "image-missing", image: "x:1" },
      { kind: "image-missing", image: "x:1" },
    ],
    ["rejected", { kind: "rejected" }, { kind: "rejected" }],
    ["failed", { kind: "failed" }, { kind: "failed" }],
  ])("peek shows %s", async (_case, answer, expected) => {
    const { actions } = setup(answer);

    expect(await actions.peekEnvironment(session("user_a"), FIXTURE_COURSE_ID, LESSON)).toEqual(
      expected,
    );
  });

  it.each<[string, WorkspaceAnswer, unknown]>([
    [
      "created",
      { kind: "workspace", workspace: workspace({ outcome: "created" }) },
      { kind: "running", outcome: "created" },
    ],
    [
      "a stopped answer",
      { kind: "workspace", workspace: workspace({ state: "stopped" }) },
      { kind: "failed" },
    ],
    ["not-found", { kind: "not-found" }, { kind: "failed" }],
    ["Docker down", { kind: "docker-down" }, { kind: "docker-down" }],
  ])("start maps %s", async (_case, answer, expected) => {
    const { actions, calls } = setup(answer);

    const result = await actions.startEnvironment(session("user_a"), FIXTURE_COURSE_ID, LESSON);

    expect(result).toEqual(expected);
    expect(calls.map((call) => call.method)).toEqual(["ensure"]);
  });
});

describe("recordLessonStarted action", () => {
  it("records the session user's lesson, never a user from the arguments", async () => {
    const { actions, started } = setup({ kind: "failed" });

    const result: unknown = await Reflect.apply(actions.recordLessonStarted, actions, [
      session("user_a"),
      FIXTURE_COURSE_ID,
      LESSON,
      "user_b",
    ]);

    expect(result).toEqual({ kind: "recorded" });
    expect(started).toEqual([{ userId: "user_a", courseId: FIXTURE_COURSE_ID, lessonId: LESSON }]);
  });

  it("writes nothing without a session", async () => {
    const { actions, recordStarted } = setup({ kind: "failed" });

    expect(await actions.recordLessonStarted(async () => null, FIXTURE_COURSE_ID, LESSON)).toEqual({
      kind: "unauthenticated",
    });
    expect(recordStarted).not.toHaveBeenCalled();
  });

  it.each([
    ["a lesson without workspace", "first-lesson"],
    ["a draft lesson", "draft-lesson"],
    ["an unknown lesson", "no-such-lesson"],
  ])("writes nothing for %s", async (_case, lessonId) => {
    const { actions, recordStarted } = setup({ kind: "failed" });

    expect(
      await actions.recordLessonStarted(session("user_a"), FIXTURE_COURSE_ID, lessonId),
    ).toEqual({ kind: "failed" });
    expect(recordStarted).not.toHaveBeenCalled();
  });

  it("answers failed and logs the error's name and code only when the write fails", async () => {
    const { actions, recordStarted, log } = setup({ kind: "failed" });
    recordStarted.mockRejectedValueOnce(
      Object.assign(new Error("Failed query: insert ... params: canary-param"), { code: "23503" }),
    );

    const result = await actions.recordLessonStarted(session("user_a"), FIXTURE_COURSE_ID, LESSON);

    expect(result).toEqual({ kind: "failed" });
    expect(log.mock.calls).toEqual([["web: lesson started write failed: Error (23503)"]]);
  });
});

// The service's answers for one test, each call recorded in order; a call the script has no answer for rejects.
interface Script {
  get?: WorkspaceAnswer;
  ensure?: WorkspaceAnswer;
  stop?: WorkspaceAnswer;
  removes?: RemoveAnswer[];
  activity?: ActivityAnswer;
}

function scripted(script: Script, readCourseTree = async () => course) {
  const order: string[] = [];
  const sleeps: number[] = [];
  const removes = [...(script.removes ?? [])];
  const answer = <T>(method: keyof WorkspaceClient, value: T | undefined) =>
    value === undefined
      ? undefined
      : async (): Promise<T> => {
          order.push(method);
          return value;
        };
  const client = fakeWorkspaceClient({
    get: answer("get", script.get),
    ensure: answer("ensure", script.ensure),
    stop: answer("stop", script.stop),
    activity: answer("activity", script.activity),
    remove: async () => {
      order.push("remove");
      const next = removes.shift();
      if (next === undefined) throw new UnexpectedWorkspaceCallError("remove");
      return next;
    },
  });
  const actions = createEnvironmentActions({
    getCourse: readCourseTree,
    client,
    mintTicket: () => ({ ticket: "minted", renewInMs: 1 }),
    now: () => NOW,
    recordStarted: async () => {},
    log: () => {},
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  return { actions, order, sleeps };
}

const RUNNING_ANSWER: WorkspaceAnswer = {
  kind: "workspace",
  workspace: workspace({ outcome: "started" }),
};
const STOPPED_ANSWER: WorkspaceAnswer = {
  kind: "workspace",
  workspace: workspace({ state: "stopped", exit: { code: 0, reason: "exited" } }),
};
const MINUTE_MS = 60_000;

describe("restart, reset, idle and activity actions", () => {
  it.each([
    "restartEnvironment",
    "resetEnvironment",
    "readEnvironmentIdle",
    "recordEnvironmentActivity",
  ] as const)("%s answers unauthenticated without a session and calls nothing", async (name) => {
    const getCourse = vi.fn(async () => course);
    const { actions, order } = scripted(
      {
        get: RUNNING_ANSWER,
        ensure: RUNNING_ANSWER,
        stop: STOPPED_ANSWER,
        removes: [{ kind: "removed" }],
        activity: { kind: "recorded" },
      },
      getCourse,
    );

    const result = await actions[name](async () => null, FIXTURE_COURSE_ID, LESSON);

    expect(result).toEqual({ kind: "unauthenticated" });
    expect(getCourse).not.toHaveBeenCalled();
    expect(order).toEqual([]);
  });

  it.each<[string, WorkspaceAnswer]>([
    ["a stopped workspace", STOPPED_ANSWER],
    ["no workspace", { kind: "not-found" }],
  ])("restart stops and then ensures after a stop answering %s", async (_case, stop) => {
    const { actions, order } = scripted({ stop, ensure: RUNNING_ANSWER });

    const result = await actions.restartEnvironment(session("user_a"), FIXTURE_COURSE_ID, LESSON);

    expect(result).toEqual({ kind: "running", outcome: "started" });
    expect(order).toEqual(["stop", "ensure"]);
  });

  it("restart answers failed without an ensure when the stop answers running", async () => {
    const { actions, order } = scripted({ stop: RUNNING_ANSWER, ensure: RUNNING_ANSWER });

    const result = await actions.restartEnvironment(session("user_a"), FIXTURE_COURSE_ID, LESSON);

    expect(result).toEqual({ kind: "failed" });
    expect(order).toEqual(["stop"]);
  });

  it("restart returns a failed stop as it is and never ensures", async () => {
    const { actions, order } = scripted({ stop: { kind: "docker-down" }, ensure: RUNNING_ANSWER });

    const result = await actions.restartEnvironment(session("user_a"), FIXTURE_COURSE_ID, LESSON);

    expect(result).toEqual({ kind: "docker-down" });
    expect(order).toEqual(["stop"]);
  });

  it("reset retries a busy remove after 500 ms and ensures once it is removed", async () => {
    const { actions, order, sleeps } = scripted({
      removes: [{ kind: "busy" }, { kind: "removed" }],
      ensure: RUNNING_ANSWER,
    });

    const result = await actions.resetEnvironment(session("user_a"), FIXTURE_COURSE_ID, LESSON);

    expect(result).toEqual({ kind: "running", outcome: "started" });
    expect(order).toEqual(["remove", "remove", "ensure"]);
    expect(sleeps).toEqual([500]);
  });

  it("reset gives up after three busy answers and never ensures the old volume", async () => {
    const { actions, order, sleeps } = scripted({
      removes: [{ kind: "busy" }, { kind: "busy" }, { kind: "busy" }],
      ensure: RUNNING_ANSWER,
    });

    const result = await actions.resetEnvironment(session("user_a"), FIXTURE_COURSE_ID, LESSON);

    expect(result).toEqual({ kind: "failed" });
    expect(order).toEqual(["remove", "remove", "remove"]);
    expect(sleeps).toEqual([500, 1000]);
  });

  it("reset returns the last failure of three and never ensures", async () => {
    const { actions, order } = scripted({
      removes: [{ kind: "docker-down" }, { kind: "docker-down" }, { kind: "docker-down" }],
      ensure: RUNNING_ANSWER,
    });

    const result = await actions.resetEnvironment(session("user_a"), FIXTURE_COURSE_ID, LESSON);

    expect(result).toEqual({ kind: "docker-down" });
    expect(order).toEqual(["remove", "remove", "remove"]);
  });

  it("reads the idle schedule as durations from the server's clock", async () => {
    const idle = {
      warningAt: new Date(NOW + 10 * MINUTE_MS).toISOString(),
      stopAt: new Date(NOW + 15 * MINUTE_MS).toISOString(),
    };
    const { actions, order } = scripted({
      get: { kind: "workspace", workspace: workspace({ idle }) },
    });

    const result = await actions.readEnvironmentIdle(session("user_a"), FIXTURE_COURSE_ID, LESSON);

    expect(result).toEqual({
      kind: "idle",
      warnInMs: 600_000,
      stopInMs: 900_000,
      warningMinutes: 5,
    });
    expect(order).toEqual(["get"]);
  });

  it.each<[string, WorkspaceAnswer]>([
    ["a running workspace with no idle schedule", { kind: "workspace", workspace: workspace({}) }],
    ["a stopped workspace", STOPPED_ANSWER],
    ["no workspace", { kind: "not-found" }],
    [
      "an unparsable warning time",
      {
        kind: "workspace",
        workspace: workspace({ idle: { warningAt: "x", stopAt: new Date(NOW).toISOString() } }),
      },
    ],
    [
      "a stop before the warning",
      {
        kind: "workspace",
        workspace: workspace({
          idle: {
            warningAt: new Date(NOW + 2 * MINUTE_MS).toISOString(),
            stopAt: new Date(NOW + MINUTE_MS).toISOString(),
          },
        }),
      },
    ],
  ])("reads no idle schedule for %s", async (_case, get) => {
    const { actions } = scripted({ get });

    expect(await actions.readEnvironmentIdle(session("user_a"), FIXTURE_COURSE_ID, LESSON)).toEqual(
      { kind: "none" },
    );
  });

  it("answers failed for an idle read the service fails", async () => {
    const { actions } = scripted({ get: { kind: "docker-down" } });

    expect(await actions.readEnvironmentIdle(session("user_a"), FIXTURE_COURSE_ID, LESSON)).toEqual(
      { kind: "failed" },
    );
  });

  it.each<[ActivityAnswer, unknown]>([
    [{ kind: "recorded" }, { kind: "recorded" }],
    [{ kind: "not-running" }, { kind: "not-running" }],
    [{ kind: "docker-down" }, { kind: "failed" }],
  ])("passes the activity answer %j through as %j", async (activity, expected) => {
    const { actions, order } = scripted({ activity });

    const result = await actions.recordEnvironmentActivity(
      session("user_a"),
      FIXTURE_COURSE_ID,
      LESSON,
    );

    expect(result).toEqual(expected);
    expect(order).toEqual(["activity"]);
  });
});
