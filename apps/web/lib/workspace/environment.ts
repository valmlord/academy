import type { CourseLookup } from "../course/courses";
import { findLesson } from "../course/view";
import { describeDbError } from "../db-error";
import type { StartedLesson } from "../progress/lesson-started";
import type { SessionData } from "../session-reader";
import type { TerminalTicket, TicketRequest } from "../terminal/mint";
import type {
  RemoveAnswer,
  WorkspaceAnswer,
  WorkspaceClient,
  WorkspaceFailure,
  WorkspaceKey,
} from "./client";

// The logic of the lesson page's environment actions (#32 design 3.3 layer 1); the server action module only
// wires the data access layer in. Every action reads the session first, takes nothing but the course and
// lesson ids from the browser, and builds the workspace key from the session's own user id.

/** What the environment region can show (design 3.6); results cross the server action boundary as-is. */
export type EnvironmentResult =
  | { kind: "unauthenticated" }
  | {
      kind: "running";
      outcome: "created" | "started" | "running" | null;
      // The lesson was started before this start or restart and its PUT created the workspace (ADR-0007 item 5
      // as amended by #150): the working folder was lost and created again from the starter.
      isVolumeRecreated: boolean;
    }
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

/**
 * `readEnvironmentIdle`'s answer. The durations are measured on the server against the service's times (one host
 * clock in compose), because the browser's clock may be anywhere; `warningMinutes` is the warning window's length.
 */
export type IdleResult =
  | { kind: "idle"; warnInMs: number; stopInMs: number; warningMinutes: number }
  | { kind: "none" }
  | { kind: "unauthenticated" }
  | { kind: "failed" };

/** `recordEnvironmentActivity`'s answer; `not-running` once the workspace has stopped. */
export type ActivityResult =
  | { kind: "recorded" }
  | { kind: "not-running" }
  | { kind: "unauthenticated" }
  | { kind: "failed" };

export interface EnvironmentDeps {
  /** The per-course read (ADR-0009 item 8); it alone checks the browser-sent course id. */
  getCourseById: (courseId: unknown) => Promise<CourseLookup>;
  client: WorkspaceClient;
  mintTicket: (request: TicketRequest) => TerminalTicket;
  now: () => number;
  recordStarted: (lesson: StartedLesson) => Promise<void>;
  readStarted: (lesson: StartedLesson) => Promise<boolean>;
  log: (line: string) => void;
  sleep: (ms: number) => Promise<void>;
}

// ADR-0010 item 7: the caller retries DELETE on any non-204 answer. Bounded, so a volume that stays busy cannot
// hold the request open: the first call and two retries, after these waits.
export const REMOVE_ATTEMPTS = 3;
export const REMOVE_RETRY_MS: readonly number[] = [500, 1000];

const MINUTE_MS = 60_000;

// ADR-0010 item 3: the service refuses any other user id with 400, so it is refused here first.
const USER_ID = /^[A-Za-z0-9_-]{1,64}$/;

export type KeyLookup =
  | { kind: "key"; key: WorkspaceKey; session: SessionData }
  | { kind: "unauthenticated" | "failed" };

/**
 * The workspace key of the signed-in user for a visible lesson with a `workspace` section, read in this
 * order: session (DAL), user id rule, lesson id type, course, lesson. A course id that names no course and a
 * course that cannot be read are both `failed`; the read logs the latter itself (lib/course/reads.ts).
 */
export async function lookupWorkspaceKey(
  readSession: ReadSession,
  getCourseById: (courseId: unknown) => Promise<CourseLookup>,
  courseId: unknown,
  lessonId: unknown,
): Promise<KeyLookup> {
  const session = await readSession();
  if (session === null) return { kind: "unauthenticated" };
  const userId = session.user.id;
  if (!USER_ID.test(userId)) return { kind: "failed" };
  if (typeof lessonId !== "string") return { kind: "failed" };
  const lookup = await getCourseById(courseId);
  if (lookup.kind !== "course") return { kind: "failed" };
  const found = findLesson(lookup.tree, lessonId);
  if (found === undefined || found.node.lesson.workspace === undefined) return { kind: "failed" };
  return {
    kind: "key",
    // From the tree, never from the argument: the key names the listed course.
    key: { userId, courseId: lookup.tree.id, lessonId: found.node.lesson.id },
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
  /** `POST W/stop`, then `PUT W`: the container restarts and the files stay. */
  restartEnvironment(
    readSession: ReadSession,
    courseId: unknown,
    lessonId: unknown,
  ): Promise<EnvironmentResult>;
  /** `DELETE W`, then `PUT W` only after a 204: the workspace is created again from the lesson's starter. */
  resetEnvironment(
    readSession: ReadSession,
    courseId: unknown,
    lessonId: unknown,
  ): Promise<EnvironmentResult>;
  /** `GET W`: when the idle warning of a running workspace starts and when the idle stop comes. */
  readEnvironmentIdle(
    readSession: ReadSession,
    courseId: unknown,
    lessonId: unknown,
  ): Promise<IdleResult>;
  /** `POST W/activity`: the learner chose to keep working, so the idle window moves. */
  recordEnvironmentActivity(
    readSession: ReadSession,
    courseId: unknown,
    lessonId: unknown,
  ): Promise<ActivityResult>;
}

/** The session's expiry in epoch ms when it is a valid date after `now`; Better Auth's cache may hand back a string. */
function sessionExpiry(session: SessionData, now: number): number | undefined {
  const expiresAt: unknown = session.session.expiresAt;
  if (!(expiresAt instanceof Date)) return undefined;
  const time = expiresAt.getTime();
  return Number.isFinite(time) && time > now ? time : undefined;
}

/** Only a running workspace with two parsable times, the stop after the warning, has an idle schedule. */
function idleOf(answer: WorkspaceAnswer, now: number): IdleResult {
  if (answer.kind === "not-found") return { kind: "none" };
  if (answer.kind !== "workspace") return { kind: "failed" };
  const { workspace } = answer;
  if (workspace.state !== "running" || workspace.idle === null) return { kind: "none" };
  const warningAt = Date.parse(workspace.idle.warningAt);
  const stopAt = Date.parse(workspace.idle.stopAt);
  if (!Number.isFinite(warningAt) || !Number.isFinite(stopAt) || stopAt <= warningAt) {
    return { kind: "none" };
  }
  return {
    kind: "idle",
    warnInMs: warningAt - now,
    stopInMs: stopAt - now,
    warningMinutes: Math.round((stopAt - warningAt) / MINUTE_MS),
  };
}

export function createEnvironmentActions(deps: EnvironmentDeps): EnvironmentActions {
  async function ensureRunning(
    key: WorkspaceKey,
    isStartedBefore: boolean,
  ): Promise<EnvironmentResult> {
    const answer = await deps.client.ensure(key);
    // PUT never answers 404 workspace-not-found; a stopped answer would break ADR-0010's contract.
    if (answer.kind === "not-found") return { kind: "failed" };
    if (answer.kind !== "workspace") return answer;
    const { workspace } = answer;
    if (workspace.state !== "running") return { kind: "failed" };
    return {
      kind: "running",
      outcome: workspace.outcome ?? null,
      isVolumeRecreated: isStartedBefore && workspace.outcome === "created",
    };
  }

  // Read before the first service call, so a row another tab writes while this call creates the workspace does
  // not count. A failed read costs the note, not the start.
  async function wasStarted(key: WorkspaceKey): Promise<boolean> {
    try {
      return await deps.readStarted(key);
    } catch (error: unknown) {
      // Name, code and constraint only: a Drizzle message carries the query parameters (ADR-0008 item 11).
      deps.log(`web: lesson started read failed: ${describeDbError(error)}`);
      return false;
    }
  }

  async function removeWithRetries(key: WorkspaceKey): Promise<RemoveAnswer> {
    let answer = await deps.client.remove(key);
    for (let attempt = 1; attempt < REMOVE_ATTEMPTS && answer.kind !== "removed"; attempt += 1) {
      await deps.sleep(REMOVE_RETRY_MS[attempt - 1] ?? 0);
      answer = await deps.client.remove(key);
    }
    return answer;
  }

  return {
    async peekEnvironment(readSession, courseId, lessonId) {
      const lookup = await lookupWorkspaceKey(readSession, deps.getCourseById, courseId, lessonId);
      if (lookup.kind !== "key") return { kind: lookup.kind };
      const answer = await deps.client.get(lookup.key);
      if (answer.kind === "not-found") return { kind: "absent" };
      if (answer.kind !== "workspace") return answer;
      const { workspace } = answer;
      if (workspace.state === "running") {
        return { kind: "running", outcome: null, isVolumeRecreated: false };
      }
      return workspace.exit?.reason === "memory-limit" ? { kind: "limits" } : { kind: "stopped" };
    },

    async startEnvironment(readSession, courseId, lessonId) {
      const lookup = await lookupWorkspaceKey(readSession, deps.getCourseById, courseId, lessonId);
      if (lookup.kind !== "key") return { kind: lookup.kind };
      const isStartedBefore = await wasStarted(lookup.key);
      return ensureRunning(lookup.key, isStartedBefore);
    },

    async openTerminal(readSession, courseId, lessonId) {
      const lookup = await lookupWorkspaceKey(readSession, deps.getCourseById, courseId, lessonId);
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
      const lookup = await lookupWorkspaceKey(readSession, deps.getCourseById, courseId, lessonId);
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

    async restartEnvironment(readSession, courseId, lessonId) {
      const lookup = await lookupWorkspaceKey(readSession, deps.getCourseById, courseId, lessonId);
      if (lookup.kind !== "key") return { kind: lookup.kind };
      const isStartedBefore = await wasStarted(lookup.key);
      const stopped = await deps.client.stop(lookup.key);
      if (stopped.kind === "workspace") {
        // A stop that answers running would break ADR-0010's contract.
        if (stopped.workspace.state === "running") return { kind: "failed" };
      } else if (stopped.kind !== "not-found") {
        return stopped;
      }
      return ensureRunning(lookup.key, isStartedBefore);
    },

    async resetEnvironment(readSession, courseId, lessonId) {
      const lookup = await lookupWorkspaceKey(readSession, deps.getCourseById, courseId, lessonId);
      if (lookup.kind !== "key") return { kind: lookup.kind };
      const removed = await removeWithRetries(lookup.key);
      // A PUT after a failed DELETE would start the old volume and report a reset that did not happen.
      if (removed.kind === "busy") return { kind: "failed" };
      if (removed.kind !== "removed") return removed;
      return ensureRunning(lookup.key, false);
    },

    async readEnvironmentIdle(readSession, courseId, lessonId) {
      const lookup = await lookupWorkspaceKey(readSession, deps.getCourseById, courseId, lessonId);
      if (lookup.kind !== "key") return { kind: lookup.kind };
      return idleOf(await deps.client.get(lookup.key), deps.now());
    },

    async recordEnvironmentActivity(readSession, courseId, lessonId) {
      const lookup = await lookupWorkspaceKey(readSession, deps.getCourseById, courseId, lessonId);
      if (lookup.kind !== "key") return { kind: lookup.kind };
      const answer = await deps.client.activity(lookup.key);
      if (answer.kind === "recorded" || answer.kind === "not-running") return answer;
      return { kind: "failed" };
    },
  };
}
