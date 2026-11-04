import type { CourseTree } from "../course/read";
import { findLesson } from "../course/view";
import { describeDbError } from "../db-error";
import type { StartedLesson } from "../progress/lesson-started";
import type { SessionData } from "../session-reader";
import type { TerminalTicket, TicketRequest } from "../terminal/mint";
import type { WorkspaceClient, WorkspaceFailure, WorkspaceKey } from "./client";

// The logic of the lesson page's environment actions (#32 design 3.3 layer 1); the server action module only
// wires the data access layer in. Every action reads the session first, takes nothing but the course and
// lesson ids from the browser, and builds the workspace key from the session's own user id.

/** What the environment region can show (design 3.6); results cross the server action boundary as-is. */
export type EnvironmentResult =
  | { kind: "unauthenticated" }
  | { kind: "running"; outcome: "created" | "started" | "running" | null }
  // Only from peek: the workspace was never created, so a start shows the "creating" copy, not "starting".
  | { kind: "absent" }
  | { kind: "stopped" }
  // Stopped after an out-of-memory kill (ADR-0010 item 4 `exit.reason`), for the memory-limit copy.
  | { kind: "limits" }
  | WorkspaceFailure;

export type ReadSession = () => Promise<SessionData | null>;

/** `openTerminal`'s answer: a ticket and its renewal delay, or the state that keeps the terminal closed. */
export type OpenTerminalResult =
  | { kind: "ticket"; ticket: string; renewInMs: number | null }
  | { kind: "unauthenticated" }
  | { kind: "stopped" }
  | { kind: "limits" }
  | WorkspaceFailure;

/** `recordLessonStarted`'s answer; the browser retries a `failed` one on a later input (design 3.4). */
export type LessonStartedResult =
  | { kind: "recorded" }
  | { kind: "unauthenticated" }
  | { kind: "failed" };

export interface EnvironmentDeps {
  getCourse: () => Promise<CourseTree>;
  client: WorkspaceClient;
  mintTicket: (request: TicketRequest) => TerminalTicket;
  now: () => number;
  recordStarted: (lesson: StartedLesson) => Promise<void>;
  log: (line: string) => void;
}

// ADR-0010 item 3: the service refuses any other user id with 400, so it is refused here first.
const USER_ID = /^[A-Za-z0-9_-]{1,64}$/;

export type KeyLookup =
  | { kind: "key"; key: WorkspaceKey; session: SessionData }
  | { kind: "unauthenticated" | "failed" };

/**
 * The workspace key of the signed-in user for a visible lesson with a `workspace` section, read in this
 * order: session (DAL), user id rule, course, lesson. A course that cannot be read is `failed`.
 */
export async function lookupWorkspaceKey(
  readSession: ReadSession,
  getCourse: () => Promise<CourseTree>,
  courseId: unknown,
  lessonId: unknown,
): Promise<KeyLookup> {
  const session = await readSession();
  if (session === null) return { kind: "unauthenticated" };
  const userId = session.user.id;
  if (!USER_ID.test(userId)) return { kind: "failed" };
  if (typeof courseId !== "string" || typeof lessonId !== "string") return { kind: "failed" };
  let course: CourseTree;
  try {
    course = await getCourse();
  } catch {
    // getCourse logs the failed file itself (lib/course/server.ts).
    return { kind: "failed" };
  }
  if (course.id !== courseId) return { kind: "failed" };
  const found = findLesson(course, lessonId);
  if (found === undefined || found.node.lesson.workspace === undefined) return { kind: "failed" };
  return {
    kind: "key",
    key: { userId, courseId: course.id, lessonId: found.node.lesson.id },
    session,
  };
}

export interface EnvironmentActions {
  /** `GET W`: the state to show before or without starting anything. */
  peekEnvironment(
    readSession: ReadSession,
    courseId: unknown,
    lessonId: unknown,
  ): Promise<EnvironmentResult>;
  /** `PUT W`: creates or starts the lesson's workspace (auto-start on page open, D5). */
  startEnvironment(
    readSession: ReadSession,
    courseId: unknown,
    lessonId: unknown,
  ): Promise<EnvironmentResult>;
  /**
   * A ticket for the running workspace's terminal. Reads the session on every call, renewals included, so a
   * revoked session gets no new connection (D11).
   */
  openTerminal(
    readSession: ReadSession,
    courseId: unknown,
    lessonId: unknown,
  ): Promise<OpenTerminalResult>;
  /**
   * Marks the lesson started for the signed-in user (the first key or paste in its terminal). It can only
   * mark the caller's own lesson, and only one that exists, is visible and has a workspace.
   */
  recordLessonStarted(
    readSession: ReadSession,
    courseId: unknown,
    lessonId: unknown,
  ): Promise<LessonStartedResult>;
}

/** The session's expiry in epoch ms when it is a valid date after `now`; Better Auth's cache may hand back a string. */
function sessionExpiry(session: SessionData, now: number): number | undefined {
  const expiresAt: unknown = session.session.expiresAt;
  if (!(expiresAt instanceof Date)) return undefined;
  const time = expiresAt.getTime();
  return Number.isFinite(time) && time > now ? time : undefined;
}

export function createEnvironmentActions(deps: EnvironmentDeps): EnvironmentActions {
  return {
    async peekEnvironment(readSession, courseId, lessonId) {
      const lookup = await lookupWorkspaceKey(readSession, deps.getCourse, courseId, lessonId);
      if (lookup.kind !== "key") return { kind: lookup.kind };
      const answer = await deps.client.get(lookup.key);
      if (answer.kind === "not-found") return { kind: "absent" };
      if (answer.kind !== "workspace") return answer;
      const { workspace } = answer;
      if (workspace.state === "running") return { kind: "running", outcome: null };
      return workspace.exit?.reason === "memory-limit" ? { kind: "limits" } : { kind: "stopped" };
    },

    async startEnvironment(readSession, courseId, lessonId) {
      const lookup = await lookupWorkspaceKey(readSession, deps.getCourse, courseId, lessonId);
      if (lookup.kind !== "key") return { kind: lookup.kind };
      const answer = await deps.client.ensure(lookup.key);
      // PUT never answers 404 workspace-not-found; a stopped answer would break ADR-0010's contract.
      if (answer.kind === "not-found") return { kind: "failed" };
      if (answer.kind !== "workspace") return answer;
      const { workspace } = answer;
      if (workspace.state !== "running") return { kind: "failed" };
      return { kind: "running", outcome: workspace.outcome ?? null };
    },

    async openTerminal(readSession, courseId, lessonId) {
      const lookup = await lookupWorkspaceKey(readSession, deps.getCourse, courseId, lessonId);
      if (lookup.kind !== "key") return { kind: lookup.kind };
      const now = deps.now();
      const sessionExpiresAt = sessionExpiry(lookup.session, now);
      if (sessionExpiresAt === undefined) return { kind: "failed" };
      const answer = await deps.client.get(lookup.key);
      // Never created: the environment-stopped state, whose action starts it.
      if (answer.kind === "not-found") return { kind: "stopped" };
      if (answer.kind !== "workspace") return answer;
      const { workspace } = answer;
      if (workspace.state !== "running") {
        return workspace.exit?.reason === "memory-limit" ? { kind: "limits" } : { kind: "stopped" };
      }
      try {
        const { ticket, renewInMs } = deps.mintTicket({ ...lookup.key, sessionExpiresAt });
        return { kind: "ticket", ticket, renewInMs };
      } catch {
        // TicketKeyError: the secret is checked at startup, so this is not expected; nothing to show but failed.
        return { kind: "failed" };
      }
    },

    async recordLessonStarted(readSession, courseId, lessonId) {
      const lookup = await lookupWorkspaceKey(readSession, deps.getCourse, courseId, lessonId);
      if (lookup.kind !== "key") return { kind: lookup.kind };
      try {
        await deps.recordStarted(lookup.key);
        return { kind: "recorded" };
      } catch (error: unknown) {
        // Name, code and constraint only: a Drizzle message carries the query parameters (ADR-0008 item 11).
        deps.log(`web: lesson started write failed: ${describeDbError(error)}`);
        return { kind: "failed" };
      }
    },
  };
}
