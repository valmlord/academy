import { attempts, CHECK_KINDS, checkClosures, checkResults, type Database } from "@academy/db";
import { and, asc, eq } from "drizzle-orm";
import type { AttemptFact, ClosureFact, IncludedCheck, LessonFacts, ResultFact } from "./rules";
import type { CheckKind } from "./shipped-kinds";

// Loads the stored facts of one learner's lesson for the rule module. Shared by the outcome writer
// and the check-state reads, so both evaluate exactly the same rows.

export type DbTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface LessonKey {
  userId: string;
  courseId: string;
  lessonId: string;
}

export type StoredLessonFacts = Pick<LessonFacts, "attempts" | "results" | "closures">;

/** A stored kind outside the lesson contract: the DB CHECKs forbid it, so the schema and code disagree. */
export class StoredFactError extends Error {
  constructor(
    readonly row: string,
    readonly column: string,
    readonly value: string,
  ) {
    super(`${column} of ${row} holds "${value}", which is not a known check kind`);
    this.name = "StoredFactError";
  }
}

const KNOWN_KINDS: ReadonlySet<string> = new Set(CHECK_KINDS);

function isCheckKind(value: string): value is CheckKind {
  return KNOWN_KINDS.has(value);
}

function checkKindOf(value: string | undefined, row: string, column: string): CheckKind {
  if (value === undefined || !isCheckKind(value)) {
    throw new StoredFactError(row, column, value ?? "<missing>");
  }
  return value;
}

function includedChecks(
  attemptId: string,
  ids: readonly string[],
  kinds: readonly string[],
): IncludedCheck[] {
  return ids.map((checkId, position) => ({
    checkId,
    checkKind: checkKindOf(
      kinds[position],
      `attempt ${attemptId}`,
      "attempts.included_check_kinds",
    ),
  }));
}

/**
 * Attempts of every status, results of every attempt (a running one's included: decision D10, a
 * result counts from its commit) and closures of every kind, all filtered by the learner's key.
 */
export async function loadLessonFacts(
  tx: DbTransaction,
  key: LessonKey,
): Promise<StoredLessonFacts> {
  const attemptRows = await tx
    .select()
    .from(attempts)
    .where(
      and(
        eq(attempts.userId, key.userId),
        eq(attempts.courseId, key.courseId),
        eq(attempts.lessonId, key.lessonId),
      ),
    )
    .orderBy(asc(attempts.startedAt), asc(attempts.id));
  const resultRows = await tx
    .select({ result: checkResults, attemptStartedAt: attempts.startedAt })
    .from(checkResults)
    .innerJoin(attempts, eq(checkResults.attemptId, attempts.id))
    .where(
      and(
        eq(attempts.userId, key.userId),
        eq(attempts.courseId, key.courseId),
        eq(attempts.lessonId, key.lessonId),
      ),
    );
  const closureRows = await tx
    .select()
    .from(checkClosures)
    .where(
      and(
        eq(checkClosures.userId, key.userId),
        eq(checkClosures.courseId, key.courseId),
        eq(checkClosures.lessonId, key.lessonId),
      ),
    );

  return {
    attempts: attemptRows.map(
      (row): AttemptFact => ({
        attemptId: row.id,
        status: row.status,
        startedAt: row.startedAt,
        finishedAt: row.finishedAt,
        includedChecks: includedChecks(row.id, row.includedCheckIds, row.includedCheckKinds),
      }),
    ),
    results: resultRows.map(
      ({ result, attemptStartedAt }): ResultFact => ({
        attemptId: result.attemptId,
        attemptStartedAt,
        checkId: result.checkId,
        checkKind: checkKindOf(
          result.checkKind,
          `result ${result.attemptId}/${result.checkId}`,
          "check_results.check_kind",
        ),
        status: result.status,
        isFormatError: result.isFormatError,
        isBudgetExhausted: result.isBudgetExhausted,
        message: result.message,
        rawError: result.rawError,
        costUsd: result.costUsd,
        finishedAt: result.createdAt,
      }),
    ),
    closures: closureRows.map(
      (row): ClosureFact => ({
        checkId: row.checkId,
        checkKind: checkKindOf(
          row.checkKind,
          `closure of check ${row.checkId}`,
          "check_closures.check_kind",
        ),
        closedAt: row.closedAt,
      }),
    ),
  };
}
