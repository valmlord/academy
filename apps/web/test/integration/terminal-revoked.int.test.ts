import { afterEach, describe, expect, it, vi } from "vitest";
import { nodeCourseFs } from "@/lib/course/node-fs";
import { readCourse } from "@/lib/course/read";
import { createSessionReader } from "@/lib/session-reader";
import type { Workspace } from "@/lib/workspace/client";
import { createEnvironmentActions } from "@/lib/workspace/environment";
import { deriveTicketKey } from "@/server/ticket";
import { type CourseFixture, createCourseFixture, FIXTURE_COURSE_ID } from "@/test/course-fixture";
import { APP_HOST, createCredentialUser, sessionCookieOf, signIn, testAuth } from "./auth";
import { type TestDatabase, testDatabase } from "./db";

// The marker throws outside Next's server layers; mint.ts is used as the real minter here.
vi.mock("server-only", () => ({}));

const { mintTerminalTicket } = await import("@/lib/terminal/mint");

// I-revoked (#32 design 10.4, D11): every openTerminal, a renewal included, reads the session through Better
// Auth against the database, so a revoked session gets no new ticket.

const EMAIL = "learner@example.com";
const PASSWORD = "correct horse battery";
const LESSON = "second-lesson";
const KEY = deriveTicketKey("canary-revoked-secret".padEnd(40, "x"));

let database: TestDatabase | undefined;
let fixture: CourseFixture | undefined;

afterEach(async () => {
  await database?.drop();
  database = undefined;
  fixture?.remove();
  fixture = undefined;
});

describe("I-revoked", () => {
  it("mints a ticket for a live session and answers unauthenticated once its rows are deleted", async () => {
    database = await testDatabase();
    fixture = createCourseFixture();
    const course = await readCourse(nodeCourseFs, fixture.root);
    const { auth } = testAuth(database);
    const userId = await createCredentialUser(auth, EMAIL, PASSWORD);
    const cookie = sessionCookieOf(await signIn(auth, EMAIL, PASSWORD));
    const read = createSessionReader({ getSession: auth.api.getSession });
    const readSession = () => read(new Headers({ cookie, host: APP_HOST }));
    const running: Workspace = {
      id: "0123456789abcdef0123",
      userId,
      courseId: FIXTURE_COURSE_ID,
      lessonId: LESSON,
      state: "running",
      image: "node:22.23.4-alpine",
      idle: null,
      exit: null,
      limits: { nanoCpus: 2_000_000_000, memoryBytes: 2_147_483_648, pidsLimit: 512 },
    };
    const actions = createEnvironmentActions({
      getCourse: async () => course,
      client: {
        get: async () => ({ kind: "workspace", workspace: running }),
        ensure: async () => ({ kind: "failed" }),
      },
      mintTicket: (request) => mintTerminalTicket(KEY, request, 900, Date.now()),
      now: () => Date.now(),
      recordStarted: async () => {},
      log: () => {},
    });

    const first = await actions.openTerminal(readSession, FIXTURE_COURSE_ID, LESSON);
    // The fresh database holds this one user's sessions only: what sign-out everywhere or a re-key leaves.
    await database.rows("DELETE FROM sessions");
    const renewal = await actions.openTerminal(readSession, FIXTURE_COURSE_ID, LESSON);

    expect(first.kind).toBe("ticket");
    expect(renewal).toEqual({ kind: "unauthenticated" });
  });
});
