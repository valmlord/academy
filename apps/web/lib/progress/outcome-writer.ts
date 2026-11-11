import {
  checkClosures,
  type Database,
  type LessonProgressStatus,
  lessonProgress,
} from "@academy/db";
import type { Lesson } from "@academy/lesson-schema/schema";
import { and, eq, sql } from "drizzle-orm";
import { type DbTransaction, type LessonKey, loadLessonFacts } from "./facts";
import { evaluateLesson, type LessonOutcome, nextStoredStatus } from "./rules";
import { type CheckKind, SHIPPED_CHECK_KINDS } from "./shipped-kinds";

// The only writer of `completed`, `not-passed` and check_closures (ADR-0007 as amended by #101, rule 7).
// It runs inside the caller's READ COMMITTED transaction and opens none: #34 calls it last in every
// transaction that commits a result or finishes an attempt, and web startup once per progress row.

export { type DbTransaction, StoredFactError } from "./facts";

export interface OutcomeTarget {
  userId: string;
  courseId: string;
  lesson: Lesson;
}

export interface OutcomeWrite {
  status: LessonProgressStatus;
  isChanged: boolean;
  closedCheckIds: string[];
}

/** Writers upsert the progress row before any attempt (ADR-0007 Consequences); its absence is a caller bug. */
export class LessonProgressMissingError extends Error {
  constructor(
    readonly courseId: string,
    readonly lessonId: string,
  ) {
    super(`no lesson_progress row for ${courseId}/${lessonId}`);
    this.name = "LessonProgressMissingError";
  }
}

/** The READ COMMITTED reasoning of ADR-0007 item 5 holds only at that level. */
export class OutcomeIsolationError extends Error {
  constructor(readonly isolationLevel: string) {
    super(
      `the lesson outcome writer needs read committed, the transaction runs at ${isolationLevel}`,
    );
    this.name = "OutcomeIsolationError";
  }
}

const REQUIRED_ISOLATION = "read committed";

async function assertReadCommitted(tx: DbTransaction): Promise<void> {
  const { rows } = await tx.execute(sql`SHOW transaction_isolation`);
  const level = rows[0]?.transaction_isolation;
  if (level !== REQUIRED_ISOLATION) {
    throw new OutcomeIsolationError(typeof level === "string" ? level : "an unknown level");
  }
}

function lessonKey(target: OutcomeTarget): LessonKey {
  return { userId: target.userId, courseId: target.courseId, lessonId: target.lesson.id };
}

/** The row lock comes first, so the fact queries after it see every result committed while it waited. */
async function lockStoredStatus(tx: DbTransaction, key: LessonKey): Promise<LessonProgressStatus> {
  const [row] = await tx
    .select({ status: lessonProgress.status })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, key.userId),
        eq(lessonProgress.courseId, key.courseId),
        eq(lessonProgress.lessonId, key.lessonId),
      ),
    )
    .for("no key update");
  if (row === undefined) {
    throw new LessonProgressMissingError(key.courseId, key.lessonId);
  }
  return row.status;
}

export async function applyLessonOutcome(
  tx: DbTransaction,
  target: OutcomeTarget,
  shippedKinds: ReadonlySet<CheckKind> = SHIPPED_CHECK_KINDS,
): Promise<OutcomeWrite> {
  await assertReadCommitted(tx);
  const key = lessonKey(target);
  const stored = await lockStoredStatus(tx, key);
  const facts = await loadLessonFacts(tx, key);
  const evaluation = evaluateLesson({
    checks: target.lesson.checks,
    shippedKinds,
    hasProgressRow: true,
    ...facts,
  });

  const closedCheckIds: string[] = [];
  for (const check of evaluation.checks) {
    // needsClosure comes only from the limit branch of isClosed, so attemptLimit is set whenever it holds.
    if (!check.needsClosure || check.attemptLimit === null) continue;
    const inserted = await tx
      .insert(checkClosures)
      .values({
        ...key,
        checkId: check.checkId,
        checkKind: check.kind,
        attemptLimit: check.attemptLimit,
        failedCount: check.failedCount,
      })
      .onConflictDoNothing()
      .returning({ checkId: checkClosures.checkId });
    closedCheckIds.push(...inserted.map((row) => row.checkId));
  }

  const status = nextStoredStatus(stored, withProgressRow(evaluation.derivedOutcome));
  if (status === stored) {
    return { status, isChanged: false, closedCheckIds };
  }
  await tx
    .update(lessonProgress)
    .set({
      status,
      updatedAt: sql`now()`,
      ...(status === "completed" ? { completedAt: sql`now()` } : {}),
    })
    .where(
      and(
        eq(lessonProgress.userId, key.userId),
        eq(lessonProgress.courseId, key.courseId),
        eq(lessonProgress.lessonId, key.lessonId),
      ),
    );
  return { status, isChanged: true, closedCheckIds };
}

/**
 * The writer evaluates with hasProgressRow true (it holds the row's lock), so the outcome is never
 * `not-started`; mapping it like a row with no counted progress narrows the type without an assertion.
 */
function withProgressRow(outcome: LessonOutcome): Exclude<LessonOutcome, "not-started"> {
  return outcome === "not-started" ? "in-progress" : outcome;
}

/** The writer in a transaction of its own, for the startup recompute and tests. */
export async function recomputeLessonOutcome(
  db: Database,
  target: OutcomeTarget,
  shippedKinds: ReadonlySet<CheckKind> = SHIPPED_CHECK_KINDS,
): Promise<OutcomeWrite> {
  return db.transaction((tx) => applyLessonOutcome(tx, target, shippedKinds), {
    isolationLevel: "read committed",
  });
}
