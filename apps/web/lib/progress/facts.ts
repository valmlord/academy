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

// The value comes from node-pg's text[] parser (strings, null, nested arrays of those), which
// JSON.stringify shows exactly and never throws on. For anything else the narrowing keeps a
// non-array from printing undefined (function, symbol) or throwing (a bare BigInt), and the catch
// covers an array JSON.stringify throws a TypeError on: a BigInt or a cycle inside it, or an
// element whose own toJSON throws a TypeError. Only a non-TypeError (say, one an element's own
// toJSON throws) still throws through the constructor, because swallowing an arbitrary error would
// hide a real defect; no node-pg value reaches that path. A missing element prints as bare words,
// so it cannot be confused with any stored string, which always prints in JSON quotes.
function storedValueText(value: unknown): string {
  if (value === undefined) {
    return "no value";
  }
  if (typeof value !== "string" && value !== null && !Array.isArray(value)) {
    return `a value of type ${typeof value}`;
  }
  try {
    return JSON.stringify(value);
  } catch (error: unknown) {
    if (!(error instanceof TypeError)) {
      throw error;
    }
    return "an array JSON cannot show";
  }
}

/**
 * A stored kind outside the lesson contract, or no kind at a position (`value` undefined): the DB
 * CHECKs forbid both, so the schema and code disagree.
 */
export class StoredFactError extends Error {
  constructor(
    readonly row: string,
    readonly column: string,
    readonly value: unknown,
  ) {
    super(`${column} of ${row} holds ${storedValueText(value)}, which is not a known check kind`);
    this.name = "StoredFactError";
  }
}

const KNOWN_KINDS: ReadonlySet<string> = new Set(CHECK_KINDS);

function isCheckKind(value: unknown): value is CheckKind {
  return typeof value === "string" && KNOWN_KINDS.has(value);
}

function checkKindOf(value: unknown, row: string, column: string): CheckKind {
  if (!isCheckKind(value)) {
    throw new StoredFactError(row, column, value);
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
      `attempt ${attemptId}, element ${position + 1}`,
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
