// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type CourseLookup, readCourseById } from "@/lib/course/courses";
import { CourseRootReadError } from "@/lib/course/errors";
import type { StartedLesson } from "@/lib/progress/lesson-started";
import type { SessionData } from "@/lib/session-reader";
import type { TicketRequest } from "@/lib/terminal/mint";
import {
  BROKEN_COURSE_ID,
  type CourseFixture,
  createCourseFixture,
  FIXTURE_COURSE_ID,
  fixtureSource,
  recordingCourseFs,
} from "@/test/course-fixture";
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

beforeAll(() => {
  fixture = createCourseFixture();
  // With a workspace section, so only its draft status can make it unavailable.
  fixture.write(
    "fixture-course/00-basics/03-draft/lesson.yaml",
    "id: draft-lesson\ntitle: Draft lesson\ntype: theory\noutcomes:\n  - Not yet.\nestimatedMinutes: 5\nstatus: draft\nworkspace: {}\n",
  );
});

afterAll(() => {
  fixture.remove();
});

// second-lesson is the fixture's visible lesson with a workspace section.
const LESSON = "second-lesson";

function fixtureCourseById(courseId: unknown): Promise<CourseLookup> {
  return readCourseById(fixtureSource(fixture.root), courseId);
}

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

function setup(answer: WorkspaceAnswer, getCourseById = fixtureCourseById) {
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
    getCourseById,
    client,
    mintTicket,
    now: () => NOW,
    recordStarted,
    readStarted: async () => false,
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
    const getCourseById = vi.fn(fixtureCourseById);
    const { actions, calls } = setup({ kind: "failed" }, getCourseById);

    const result = await actions.startEnvironment(async () => null, FIXTURE_COURSE_ID, LESSON);

    expect(result).toEqual({ kind: "unauthenticated" });
    expect(getCourseById).not.toHaveBeenCalled();
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

  it("answers failed when the course root cannot be read", async () => {
    const { actions, calls } = setup({ kind: "failed" }, async () => ({
      kind: "root-failure",
      error: new CourseRootReadError(".", "missing"),
    }));

    const result = await actions.peekEnvironment(session("user_a"), FIXTURE_COURSE_ID, LESSON);

    expect(result).toEqual({ kind: "failed" });
    expect(calls).toEqual([]);
  });

  it.each<[string, WorkspaceAnswer, unknown]>([
    [
      "running",
      { kind: "workspace", workspace: workspace({}) },
      { kind: "running", outcome: null, isVolumeRecreated: false },
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
      { kind: "running", outcome: "created", isVolumeRecreated: false },
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
  // The started read; without it the lesson has no row. Called as given, so a synchronous throw stays one.
  readStarted?: (lesson: StartedLesson) => Promise<boolean>;
}

function scripted(script: Script, getCourseById = fixtureCourseById) {
  const order: string[] = [];
  const reads: StartedLesson[] = [];
  const lines: string[] = [];
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
    getCourseById,
    client,
    mintTicket: () => ({ ticket: "minted", renewInMs: 1 }),
    now: () => NOW,
    recordStarted: async () => {},
    readStarted: (lesson) => {
      reads.push(lesson);
      return script.readStarted === undefined ? Promise.resolve(false) : script.readStarted(lesson);
    },
    log: (line) => {
      lines.push(line);
    },
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  return { actions, order, reads, lines, sleeps };
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
    const getCourseById = vi.fn(fixtureCourseById);
    const { actions, order } = scripted(
      {
        get: RUNNING_ANSWER,
        ensure: RUNNING_ANSWER,
        stop: STOPPED_ANSWER,
        removes: [{ kind: "removed" }],
        activity: { kind: "recorded" },
      },
      getCourseById,
    );

    const result = await actions[name](async () => null, FIXTURE_COURSE_ID, LESSON);

    expect(result).toEqual({ kind: "unauthenticated" });
    expect(getCourseById).not.toHaveBeenCalled();
    expect(order).toEqual([]);
  });

  it.each<[string, WorkspaceAnswer]>([
    ["a stopped workspace", STOPPED_ANSWER],
    ["no workspace", { kind: "not-found" }],
  ])("restart stops and then ensures after a stop answering %s", async (_case, stop) => {
    const { actions, order } = scripted({ stop, ensure: RUNNING_ANSWER });

    const result = await actions.restartEnvironment(session("user_a"), FIXTURE_COURSE_ID, LESSON);

    expect(result).toEqual({ kind: "running", outcome: "started", isVolumeRecreated: false });
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

    expect(result).toEqual({ kind: "running", outcome: "started", isVolumeRecreated: false });
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

const CREATED_ANSWER: WorkspaceAnswer = {
  kind: "workspace",
  workspace: workspace({ outcome: "created" }),
};
const KEY: StartedLesson = { userId: "user_a", courseId: FIXTURE_COURSE_ID, lessonId: LESSON };
const STARTED = async (): Promise<boolean> => true;

/** Lets queued promise callbacks run, so a call the action makes without waiting has happened. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("recreated working folder signal", () => {
  it("start reports recreated when the lesson was started and the PUT created the workspace", async () => {
    const { actions, order, reads } = scripted({ ensure: CREATED_ANSWER, readStarted: STARTED });

    const result = await actions.startEnvironment(session("user_a"), FIXTURE_COURSE_ID, LESSON);

    expect(result).toEqual({ kind: "running", outcome: "created", isVolumeRecreated: true });
    expect(reads).toEqual([KEY]);
    expect(order).toEqual(["ensure"]);
  });

  it("start reports no recreated folder on a first visit", async () => {
    const { actions, reads } = scripted({ ensure: CREATED_ANSWER, readStarted: async () => false });

    const result = await actions.startEnvironment(session("user_a"), FIXTURE_COURSE_ID, LESSON);

    expect(result).toEqual({ kind: "running", outcome: "created", isVolumeRecreated: false });
    expect(reads).toEqual([KEY]);
  });

  it.each(["started", "running"] as const)(
    "start reports no recreated folder for a started lesson when the PUT answers %s",
    async (outcome) => {
      const { actions } = scripted({
        ensure: { kind: "workspace", workspace: workspace({ outcome }) },
        readStarted: STARTED,
      });

      const result = await actions.startEnvironment(session("user_a"), FIXTURE_COURSE_ID, LESSON);

      expect(result).toEqual({ kind: "running", outcome, isVolumeRecreated: false });
    },
  );

  it.each([
    { name: "startEnvironment", calls: ["ensure"] },
    { name: "restartEnvironment", calls: ["stop", "ensure"] },
  ] as const)(
    "$name makes no service call for the recreated note until the started read returned",
    async ({ name, calls }) => {
      let answerRead: (isStarted: boolean) => void = () => {};
      const read = new Promise<boolean>((resolve) => {
        answerRead = resolve;
      });
      const { actions, order, reads } = scripted({
        stop: { kind: "not-found" },
        ensure: CREATED_ANSWER,
        readStarted: () => read,
      });

      const pending = actions[name](session("user_a"), FIXTURE_COURSE_ID, LESSON);
      await settle();
      const orderWhileReading = [...order];
      answerRead(true);
      const result = await pending;

      expect(reads).toEqual([KEY]);
      expect(orderWhileReading).toEqual([]);
      expect(order).toEqual(calls);
      expect(result).toEqual({ kind: "running", outcome: "created", isVolumeRecreated: true });
    },
  );

  it.each([
    {
      case: "rejects",
      readStarted: async (): Promise<boolean> => {
        throw Object.assign(new Error("terminating connection canary-param"), { code: "57P01" });
      },
    },
    {
      case: "throws before it returns a promise",
      readStarted: (): Promise<boolean> => {
        throw Object.assign(new Error("terminating connection canary-param"), { code: "57P01" });
      },
    },
  ])(
    "a started read that $case shows no recreated note and still starts",
    async ({ readStarted }) => {
      const { actions, order, lines } = scripted({ ensure: CREATED_ANSWER, readStarted });

      const result = await actions.startEnvironment(session("user_a"), FIXTURE_COURSE_ID, LESSON);

      expect(result).toEqual({ kind: "running", outcome: "created", isVolumeRecreated: false });
      expect(order).toEqual(["ensure"]);
      expect(lines).toEqual(["web: lesson started read failed: Error (57P01)"]);
    },
  );

  it("restart reports recreated after a stop 404 and a created PUT for a started lesson", async () => {
    const { actions, order, reads } = scripted({
      stop: { kind: "not-found" },
      ensure: CREATED_ANSWER,
      readStarted: STARTED,
    });

    const result = await actions.restartEnvironment(session("user_a"), FIXTURE_COURSE_ID, LESSON);

    expect(result).toEqual({ kind: "running", outcome: "created", isVolumeRecreated: true });
    expect(reads).toEqual([KEY]);
    expect(order).toEqual(["stop", "ensure"]);
  });

  it("restart of a started lesson reports no recreated folder when the PUT found the folder", async () => {
    const { actions } = scripted({
      stop: STOPPED_ANSWER,
      ensure: RUNNING_ANSWER,
      readStarted: STARTED,
    });

    const result = await actions.restartEnvironment(session("user_a"), FIXTURE_COURSE_ID, LESSON);

    expect(result).toEqual({ kind: "running", outcome: "started", isVolumeRecreated: false });
  });

  it("reset reports no recreated folder and does not read started", async () => {
    const { actions, order, reads } = scripted({
      removes: [{ kind: "removed" }],
      ensure: CREATED_ANSWER,
      readStarted: STARTED,
    });

    const result = await actions.resetEnvironment(session("user_a"), FIXTURE_COURSE_ID, LESSON);

    expect(result).toEqual({ kind: "running", outcome: "created", isVolumeRecreated: false });
    expect(reads).toEqual([]);
    expect(order).toEqual(["remove", "ensure"]);
  });

  it("peek does not read started and reports no recreated folder", async () => {
    const { actions, reads } = scripted({ get: RUNNING_ANSWER, readStarted: STARTED });

    const result = await actions.peekEnvironment(session("user_a"), FIXTURE_COURSE_ID, LESSON);

    expect(result).toEqual({ kind: "running", outcome: null, isVolumeRecreated: false });
    expect(reads).toEqual([]);
  });

  it.each([
    {
      name: "startEnvironment",
      case: "no session",
      readSession: async () => null,
      lessonId: LESSON,
    },
    {
      name: "startEnvironment",
      case: "a lesson without workspace",
      readSession: session("user_a"),
      lessonId: "first-lesson",
    },
    {
      name: "restartEnvironment",
      case: "no session",
      readSession: async () => null,
      lessonId: LESSON,
    },
    {
      name: "restartEnvironment",
      case: "a lesson without workspace",
      readSession: session("user_a"),
      lessonId: "first-lesson",
    },
  ] as const)(
    "$name reads nothing for the recreated note with $case",
    async ({ name, readSession, lessonId }) => {
      const { actions, order, reads } = scripted({
        stop: { kind: "not-found" },
        ensure: CREATED_ANSWER,
        readStarted: STARTED,
      });

      await actions[name](readSession, FIXTURE_COURSE_ID, lessonId);

      expect(reads).toEqual([]);
      expect(order).toEqual([]);
    },
  );
});

const ACTION_NAMES = [
  "peekEnvironment",
  "startEnvironment",
  "openTerminal",
  "recordLessonStarted",
  "restartEnvironment",
  "resetEnvironment",
  "readEnvironmentIdle",
  "recordEnvironmentActivity",
] as const;

// Every client method and every side-effect dependency records its call, so a test sees any of them.
function recordingActions() {
  const { fs, calls: fsCalls } = recordingCourseFs();
  const sideEffects: string[] = [];
  const record = (method: keyof WorkspaceClient) => async (): Promise<never> => {
    sideEffects.push(method);
    throw new UnexpectedWorkspaceCallError(method);
  };
  const actions = createEnvironmentActions({
    getCourseById: (courseId) => readCourseById(fixtureSource(fixture.root, fs), courseId),
    client: fakeWorkspaceClient({
      get: record("get"),
      ensure: record("ensure"),
      stop: record("stop"),
      remove: record("remove"),
      activity: record("activity"),
    }),
    mintTicket: () => {
      sideEffects.push("mintTicket");
      return { ticket: "minted", renewInMs: 1 };
    },
    now: () => NOW,
    recordStarted: async () => {
      sideEffects.push("recordStarted");
    },
    readStarted: async () => {
      sideEffects.push("readStarted");
      return false;
    },
    log: () => {},
    sleep: NO_SLEEP,
  });
  return { actions, fsCalls, sideEffects };
}

describe("every action and a course id that names no readable course", () => {
  const LISTING = 'listDirs ""';
  it.each(
    ACTION_NAMES.flatMap((name) =>
      [
        { courseId: "A B", lessonId: LESSON, files: [] },
        { courseId: "..", lessonId: LESSON, files: [] },
        { courseId: "../course-b", lessonId: LESSON, files: [] },
        { courseId: "no-such-course", lessonId: LESSON, files: [LISTING] },
        // broken-lesson has a workspace section, so only the course's failure keeps the key from being built.
        {
          courseId: BROKEN_COURSE_ID,
          lessonId: "broken-lesson",
          files: [LISTING, 'readText "broken-course/course.yaml"'],
        },
      ].map((row) => ({ name, ...row })),
    ),
  )(
    "$name answers failed for $courseId, calls nothing and opens only $files",
    async ({ name, courseId, lessonId, files }) => {
      const { actions, fsCalls, sideEffects } = recordingActions();

      const result = await actions[name](session("user_a"), courseId, lessonId);

      expect(result).toEqual({ kind: "failed" });
      expect(sideEffects).toEqual([]);
      expect(fsCalls).toEqual(files);
    },
  );

  it("still starts the readable course beside the failing one", async () => {
    const { actions, calls } = setup(RUNNING_ANSWER);

    const result = await actions.startEnvironment(session("user_a"), FIXTURE_COURSE_ID, LESSON);

    expect(result).toEqual({ kind: "running", outcome: "started", isVolumeRecreated: false });
    expect(calls).toEqual([
      {
        method: "ensure",
        key: { userId: "user_a", courseId: FIXTURE_COURSE_ID, lessonId: LESSON },
      },
    ]);
  });
});
