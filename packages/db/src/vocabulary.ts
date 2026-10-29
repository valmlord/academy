/**
 * Status vocabularies (ADR-0007, decision 4). Each array is the single source of both the TS column
 * type and the values of the named CHECK constraint, so a new value needs a generated migration.
 */
import { Check } from "@academy/lesson-schema";
import { type SQL, sql } from "drizzle-orm";
import { InvalidVocabularyValueError } from "./errors.js";

/** No lesson_progress row means "not started"; `completed` is sticky (ADR-0007, decision 5). */
export const LESSON_PROGRESS_STATUSES = ["in-progress", "completed"] as const;
export type LessonProgressStatus = (typeof LESSON_PROGRESS_STATUSES)[number];

/** Over the attempt's own checks only; `error` means the platform could not grade. */
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

/**
 * Builds the `('a', 'b')` list of a CHECK ... IN constraint. Throws InvalidVocabularyValueError
 * when the schema module loads if any value is not kebab-case, so a value can never inject SQL.
 */
export function inList(constraint: string, values: readonly string[]): SQL {
  for (const value of values) {
    if (!VOCABULARY_VALUE.test(value)) {
      throw new InvalidVocabularyValueError(value, constraint, VOCABULARY_VALUE);
    }
  }
  return sql.raw(`(${values.map((value) => `'${value}'`).join(", ")})`);
}
