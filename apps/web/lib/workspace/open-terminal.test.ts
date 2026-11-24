// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readCourseById } from "@/lib/course/courses";
import type { SessionData } from "@/lib/session-reader";
import { createTicketVerifier, deriveTicketKey } from "@/server/ticket";
import {
  type CourseFixture,
  createCourseFixture,
  FIXTURE_COURSE_ID,
  fixtureSource,
} from "@/test/course-fixture";
import { fakeWorkspaceClient, NO_SLEEP } from "@/test/workspace-fakes";
import type { Workspace, WorkspaceAnswer, WorkspaceKey } from "./client";
import { createEnvironmentActions } from "./environment";

// The marker throws outside Next's server layers; mint.ts is used as the real minter here.
vi.mock("server-only", () => ({}));

const { mintTerminalTicket } = await import("@/lib/terminal/mint");

// U-action-uid (#32 design 10.3): openTerminal mints for the session's own user only, whatever the browser
// sends, and refuses without a session, a usable lesson, a running workspace or a valid session expiry.

const KEY = deriveTicketKey("canary-action-secret".padEnd(40, "x"));
const NOW = Date.UTC(2026, 10, 4, 12, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;
const LESSON = "second-lesson";

let fixture: CourseFixture;

beforeAll(() => {
  fixture = createCourseFixture();
});

afterAll(() => {
  fixture.remove();
});

function session(userId: string, expiresAt: Date | string = new Date(NOW + DAY_MS)) {
  const data: SessionData = {
    user: { id: userId, email: "learner@example.com" },
    session: { expiresAt: new Date(NOW + DAY_MS) },
  };
  // A string stands for what a cache may hand back at runtime despite the declared Date.
  Reflect.set(data.session, "expiresAt", expiresAt);
  return async (): Promise<SessionData | null> => data;
}

function workspace(change: Partial<Workspace> = {}): Workspace {
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

function setup(answer: WorkspaceAnswer = { kind: "workspace", workspace: workspace() }) {
  const keys: WorkspaceKey[] = [];
  const client = fakeWorkspaceClient({
    get: async (key) => {
      keys.push(key);
      return answer;
    },
    ensure: async () => ({ kind: "failed" }),
  });
  const actions = createEnvironmentActions({
    getCourseById: (courseId) => readCourseById(fixtureSource(fixture.root), courseId),
    client,
    mintTicket: (request) => mintTerminalTicket(KEY, request, 900, NOW),
    now: () => NOW,
    recordStarted: async () => {},
    readStarted: async () => false,
    log: () => {},
    sleep: NO_SLEEP,
  });
  return { actions, keys };
}

function payloadOf(ticket: string) {
  const verdict = createTicketVerifier().verify(ticket, KEY, NOW + 1);
  if (!verdict.ok) throw new Error("the minted ticket does not verify");
  return verdict.payload;
}

describe("openTerminal (U-action-uid)", () => {
  it("mints a ticket for the session's user and returns the renewal delay", async () => {
    const { actions, keys } = setup();

    const result = await actions.openTerminal(session("user_a"), FIXTURE_COURSE_ID, LESSON);

    if (result.kind !== "ticket") throw new Error(`expected a ticket, got ${result.kind}`);
    expect(payloadOf(result.ticket)).toMatchObject({
      u: "user_a",
      c: FIXTURE_COURSE_ID,
      l: LESSON,
      dl: NOW + 900_000,
    });
    expect(result.renewInMs).toBe(840_000);
    expect(keys).toEqual([{ userId: "user_a", courseId: FIXTURE_COURSE_ID, lessonId: LESSON }]);
  });

  it("ignores extra arguments a browser sends, a user id among them", async () => {
    const { actions } = setup();

    const result: unknown = await Reflect.apply(actions.openTerminal, actions, [
      session("user_a"),
      FIXTURE_COURSE_ID,
      LESSON,
      "user_b",
      { userId: "user_b" },
    ]);

    expect(result).toMatchObject({ kind: "ticket" });
    if (typeof result !== "object" || result === null) throw new Error("no result");
    const ticket: unknown = Reflect.get(result, "ticket");
    if (typeof ticket !== "string") throw new Error("no ticket");
    expect(payloadOf(ticket).u).toBe("user_a");
  });

  it("answers unauthenticated without a session", async () => {
    const { actions, keys } = setup();

    expect(await actions.openTerminal(async () => null, FIXTURE_COURSE_ID, LESSON)).toEqual({
      kind: "unauthenticated",
    });
    expect(keys).toEqual([]);
  });

  it.each([
    ["a lesson without workspace", "first-lesson"],
    ["an unknown lesson", "no-such-lesson"],
  ])("answers failed for %s", async (_case, lessonId) => {
    const { actions, keys } = setup();

    expect(await actions.openTerminal(session("user_a"), FIXTURE_COURSE_ID, lessonId)).toEqual({
      kind: "failed",
    });
    expect(keys).toEqual([]);
  });

  it.each<[string, WorkspaceAnswer, unknown]>([
    [
      "a stopped workspace",
      { kind: "workspace", workspace: workspace({ state: "stopped" }) },
      { kind: "stopped" },
    ],
    [
      "a workspace stopped by the memory limit",
      {
        kind: "workspace",
        workspace: workspace({ state: "stopped", exit: { code: 137, reason: "memory-limit" } }),
      },
      { kind: "limits" },
    ],
    ["a workspace never created", { kind: "not-found" }, { kind: "stopped" }],
    ["Docker down", { kind: "docker-down" }, { kind: "docker-down" }],
    ["a service failure", { kind: "failed" }, { kind: "failed" }],
  ])("mints nothing for %s", async (_case, answer, expected) => {
    const { actions } = setup(answer);

    expect(await actions.openTerminal(session("user_a"), FIXTURE_COURSE_ID, LESSON)).toEqual(
      expected,
    );
  });

  it.each([
    ["a string", "2026-11-05T12:00:00.000Z"],
    ["an invalid date", new Date(Number.NaN)],
    ["a date in the past", new Date(NOW - 1)],
    ["the current instant", new Date(NOW)],
  ])("answers failed for a session expiry that is %s", async (_case, expiresAt) => {
    const { actions, keys } = setup();

    expect(
      await actions.openTerminal(session("user_a", expiresAt), FIXTURE_COURSE_ID, LESSON),
    ).toEqual({ kind: "failed" });
    expect(keys).toEqual([]);
  });

  it("answers failed when the ticket cannot be minted", async () => {
    const actions = createEnvironmentActions({
      getCourseById: (courseId) => readCourseById(fixtureSource(fixture.root), courseId),
      client: fakeWorkspaceClient({
        get: async () => ({ kind: "workspace", workspace: workspace() }),
        ensure: async () => ({ kind: "failed" }),
      }),
      mintTicket: () => {
        throw new Error("no key");
      },
      now: () => NOW,
      recordStarted: async () => {},
      readStarted: async () => false,
      log: () => {},
      sleep: NO_SLEEP,
    });

    expect(await actions.openTerminal(session("user_a"), FIXTURE_COURSE_ID, LESSON)).toEqual({
      kind: "failed",
    });
  });
});
