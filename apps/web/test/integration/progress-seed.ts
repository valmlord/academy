import {
  attempts,
  type CheckResultStatus,
  checkResults,
  type Database,
  enrollments,
  type LessonProgressStatus,
  lessonProgress,
  users,
} from "@academy/db";
import type { DbTransaction } from "@/lib/progress/facts";
import { aggregateAttemptStatus, type IncludedCheck } from "@/lib/progress/rules";
import type { CheckKind } from "@/lib/progress/shipped-kinds";

// Seeds the progress tables the way #34's writers will: progress row before any attempt, one result row
// per check, finished attempts with finished_at. Every row goes through Drizzle, so no SQL string is
// built from test values.

export const COURSE_ID = "agentic-dev";

export interface SeededLesson {
  userId: string;
  courseId: string;
  lessonId: string;
}

export async function seedUser(db: Database, userId: string): Promise<void> {
  await db
    .insert(users)
    .values({ id: userId, name: userId, email: `${userId}@example.com` })
    .onConflictDoNothing();
}

/** A user, its enrollment and a progress row of the given status. */
export async function seedProgress(
  db: Database,
  key: SeededLesson,
  status: LessonProgressStatus = "in-progress",
): Promise<void> {
  await seedUser(db, key.userId);
  await db
    .insert(enrollments)
    .values({ userId: key.userId, courseId: key.courseId })
    .onConflictDoNothing();
  await db.insert(lessonProgress).values({
    ...key,
    status,
    ...(status === "completed" ? { completedAt: new Date() } : {}),
  });
}

export interface AttemptSeed {
  status: "running" | "passed" | "failed" | "error";
  included: IncludedCheck[];
}

export async function insertAttempt(
  db: Database,
  key: SeededLesson,
  seed: AttemptSeed,
): Promise<string> {
  const [row] = await db
    .insert(attempts)
    .values({
      ...key,
      status: seed.status,
      ...(seed.status === "running" ? {} : { finishedAt: new Date() }),
      includedCheckIds: seed.included.map((check) => check.checkId),
      includedCheckKinds: seed.included.map((check) => check.checkKind),
    })
    .returning({ id: attempts.id });
  if (row === undefined) throw new Error("the attempt insert returned no row");
  return row.id;
}

export interface ResultSeed {
  checkId: string;
  checkKind?: CheckKind;
  status: CheckResultStatus;
  isFormatError?: boolean;
  message?: string | null;
  rawError?: string | null;
  costUsd?: string | null;
}

export async function insertResult(
  db: Database | DbTransaction,
  attemptId: string,
  seed: ResultSeed,
): Promise<void> {
  await db.insert(checkResults).values({
    attemptId,
    checkId: seed.checkId,
    checkKind: seed.checkKind ?? "command",
    status: seed.status,
    isFormatError: seed.isFormatError ?? false,
    message: seed.message ?? null,
    rawError: seed.rawError ?? null,
    costUsd: seed.costUsd ?? null,
  });
}

/** One finished attempt holding exactly these results. */
export async function finishedAttempt(
  db: Database,
  key: SeededLesson,
  results: ResultSeed[],
): Promise<string> {
  const [first, ...rest] = results.map((result) => result.status);
  if (first === undefined) throw new Error("a finished attempt needs at least one result");
  const id = await insertAttempt(db, key, {
    status: aggregateAttemptStatus([first, ...rest]),
    included: results.map((result) => ({
      checkId: result.checkId,
      checkKind: result.checkKind ?? "command",
    })),
  });
  for (const result of results) await insertResult(db, id, result);
  return id;
}

/** `count` finished attempts, each with one counted failure of the check. */
export async function failures(
  db: Database,
  key: SeededLesson,
  count: number,
  checkId: string,
  checkKind: CheckKind = "command",
): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await finishedAttempt(db, key, [{ checkId, checkKind, status: "failed" }]);
  }
}
