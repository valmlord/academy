// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { nodeCourseFs } from "@/lib/course/node-fs";
import { type CourseTree, readCourse } from "@/lib/course/read";
import type { SessionData } from "@/lib/session-reader";
import type { TicketRequest } from "@/lib/terminal/mint";
import { type CourseFixture, createCourseFixture, FIXTURE_COURSE_ID } from "@/test/course-fixture";
import type { Workspace, WorkspaceAnswer, WorkspaceClient, WorkspaceKey } from "./client";
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
  const client: WorkspaceClient = {
    get: async (key) => {
      calls.push({ method: "get", key });
      return answer;
    },
    ensure: async (key) => {
      calls.push({ method: "ensure", key });
      return answer;
    },
  };
  const mintTicket = vi.fn((_request: TicketRequest) => ({ ticket: "minted", renewInMs: 1 }));
  const actions = createEnvironmentActions({ getCourse, client, mintTicket, now: () => NOW });
  return { actions, calls, mintTicket };
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
