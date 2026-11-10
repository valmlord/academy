/**
 * Status vocabularies (ADR-0007, decision 4). Each array is the single source of both the TS column
 * type and the values of the named CHECK constraint, so a new value needs a generated migration.
 */
// The schema-only entry point: the package index also re-exports the validator, whose node:fs walks make
// Turbopack trace the whole project into the web build.
import { Check } from "@academy/lesson-schema/schema";
import { type SQL, sql } from "drizzle-orm";
import { InvalidVocabularyValueError } from "./errors.js";

/**
 * No lesson_progress row means "not started"; `completed` is sticky (ADR-0007, decision 5).
 * `not-passed`: no counted check of the lesson is open and at least one is closed; it keeps
 * `completed_at` NULL and is recomputed while the lesson is not passed (ADR-0007 as amended by #101).
 */
export const LESSON_PROGRESS_STATUSES = ["in-progress", "completed", "not-passed"] as const;
export type LessonProgressStatus = (typeof LESSON_PROGRESS_STATUSES)[number];

/**
 * A summary over the attempt's own check results: `error` when at least one result is `error`, else
 * `failed` when one is `failed` or `timeout`, else `passed`. Counting is per check result, so an
 * `error` attempt may still hold counted results (ADR-0007 as amended by #101, S2).
 */
export const ATTEMPT_STATUSES = ["running", "passed", "failed", "error"] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

export const CHECK_RESULT_STATUSES = ["passed", "failed", "timeout", "error"] as const;
export type CheckResultStatus = (typeof CHECK_RESULT_STATUSES)[number];

export const MENTOR_REVIEW_STATUSES = ["pending", "completed", "error"] as const;
export type MentorReviewStatus = (typeof MENTOR_REVIEW_STATUSES)[number];

/** Derived from the lesson contract (ADR-0001), never retyped here. */
export const CHECK_KINDS: readonly Check["kind"][] = Check.options.map((o) => o.shape.kind.value);

// Values reach DDL through sql.raw, so only plain kebab-case words may pass.
const VOCABULARY_VALUE = /^[a-z][a-z0-9-]*$/;

function assertVocabularyValues(constraint: string, values: readonly string[]): void {
  for (const value of values) {
    if (!VOCABULARY_VALUE.test(value)) {
      throw new InvalidVocabularyValueError(value, constraint, VOCABULARY_VALUE);
    }
  }
}

/**
 * Builds the `('a', 'b')` list of a CHECK ... IN constraint. Throws InvalidVocabularyValueError
 * when the schema module loads if any value is not kebab-case, so a value can never inject SQL.
 */
export function inList(constraint: string, values: readonly string[]): SQL {
  assertVocabularyValues(constraint, values);
  return sql.raw(`(${values.map((value) => `'${value}'`).join(", ")})`);
}

/**
 * Builds the `ARRAY['a', 'b']::text[]` operand of an array CHECK (`column <@ ...`), under the same
 * kebab-case guard as inList, because it reaches DDL through sql.raw too.
 */
export function arrayLiteral(constraint: string, values: readonly string[]): SQL {
  assertVocabularyValues(constraint, values);
  return sql.raw(`ARRAY[${values.map((value) => `'${value}'`).join(", ")}]::text[]`);
}
