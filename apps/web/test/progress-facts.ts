import type { AttemptStatus, CheckResultStatus } from "@academy/db";
import type { Check, Lesson } from "@academy/lesson-schema/schema";
import type { IncludedCheck, LessonFacts, ResultFact } from "@/lib/progress/rules";
import { type CheckKind, SHIPPED_CHECK_KINDS } from "@/lib/progress/shipped-kinds";

// Builders of the stored facts the rule module evaluates, for unit and property tests of the counting
// rules. Attempt n starts n minutes after BASE_TIME, so the list order is the attempt order.

export const BASE_TIME = Date.UTC(2026, 10, 1, 9, 0, 0);
const ATTEMPT_SPACING_MS = 60_000;
const ATTEMPT_DURATION_MS = 30_000;

export interface AttemptsBlock {
  limit?: number;
  mentorAfter?: number;
}

function base(id: string, attempts: AttemptsBlock | undefined) {
  return { id, title: `Check ${id}`, weight: 1, ...(attempts === undefined ? {} : { attempts }) };
}

export function commandCheck(id: string, attempts?: AttemptsBlock): Check {
  return { ...base(id, attempts), kind: "command", run: "true", timeoutSec: 60 };
}

export function quizCheck(id: string, attempts?: AttemptsBlock): Check {
  return { ...base(id, attempts), kind: "quiz", file: "quiz.yaml", passScore: 0.8 };
}

export function rubricCheck(id: string, attempts?: AttemptsBlock): Check {
  return {
    ...base(id, attempts),
    kind: "rubric",
    rubric: "rubric.md",
    artifacts: ["README.md"],
    passScore: 0.7,
  };
}

export function hiddenTaskCheck(id: string, budgetUsd: number, attempts?: AttemptsBlock): Check {
  return {
    ...base(id, attempts),
    kind: "hidden-task",
    task: "task.md",
    verify: "verify.sh",
    timeoutSec: 600,
    budgetUsd,
  };
}

export function bugHuntCheck(id: string, attempts?: AttemptsBlock): Check {
  return { ...base(id, attempts), kind: "bug-hunt", answers: "answers.yaml", minFound: 2 };
}

/** Builds a check of any kind with the given id, for property tests that draw the kind. */
export function checkOfKind(kind: CheckKind, id: string, attempts?: AttemptsBlock): Check {
  switch (kind) {
    case "command":
      return commandCheck(id, attempts);
    case "quiz":
      return quizCheck(id, attempts);
    case "rubric":
      return rubricCheck(id, attempts);
    case "hidden-task":
      return hiddenTaskCheck(id, 2, attempts);
    case "bug-hunt":
      return bugHuntCheck(id, attempts);
  }
}

export function lessonWith(checks: Check[]): Lesson {
  return {
    id: "lesson",
    title: "Lesson",
    type: "project",
    outcomes: ["outcome"],
    estimatedMinutes: 10,
    status: "draft",
    prerequisites: [],
    sources: [],
    checks,
  };
}

export interface ResultSpec {
  checkId: string;
  kind?: CheckKind;
  status: CheckResultStatus;
  isFormatError?: boolean;
  isBudgetExhausted?: boolean;
  message?: string | null;
  rawError?: string | null;
  costUsd?: string | null;
}

export interface AttemptSpec {
  /** Defaults to `failed`: counting never depends on the attempt's own status. */
  status?: AttemptStatus;
  results: ResultSpec[];
  /** Included checks with no result row. */
  missing?: IncludedCheck[];
}

export interface ClosureSpec {
  checkId: string;
  checkKind: CheckKind;
}

export interface FactsOptions {
  shippedKinds?: ReadonlySet<CheckKind>;
  hasProgressRow?: boolean;
  closures?: ClosureSpec[];
}

export function attemptId(index: number): string {
  return `attempt-${String(index).padStart(3, "0")}`;
}

export function lessonFacts(
  checks: readonly Check[],
  attempts: readonly AttemptSpec[],
  options: FactsOptions = {},
): LessonFacts {
  const results: ResultFact[] = [];
  const attemptFacts = attempts.map((spec, index) => {
    const id = attemptId(index);
    const status = spec.status ?? "failed";
    const startedAt = new Date(BASE_TIME + index * ATTEMPT_SPACING_MS);
    spec.results.forEach((result, position) => {
      results.push({
        attemptId: id,
        attemptStartedAt: startedAt,
        checkId: result.checkId,
        checkKind: result.kind ?? "command",
        status: result.status,
        isFormatError: result.isFormatError ?? false,
        isBudgetExhausted: result.isBudgetExhausted ?? false,
        message: result.message ?? null,
        rawError: result.rawError ?? null,
        costUsd: result.costUsd ?? null,
        finishedAt: new Date(startedAt.getTime() + 1_000 * (position + 1)),
      });
    });
    return {
      attemptId: id,
      status,
      startedAt,
      finishedAt: status === "running" ? null : new Date(startedAt.getTime() + ATTEMPT_DURATION_MS),
      includedChecks: [
        ...spec.results.map((result) => ({
          checkId: result.checkId,
          checkKind: result.kind ?? "command",
        })),
        ...(spec.missing ?? []),
      ],
    };
  });
  return {
    checks,
    shippedKinds: options.shippedKinds ?? SHIPPED_CHECK_KINDS,
    hasProgressRow: options.hasProgressRow ?? true,
    attempts: attemptFacts,
    results,
    closures: (options.closures ?? []).map((closure) => ({
      ...closure,
      closedAt: new Date(BASE_TIME),
    })),
  };
}

/** `count` attempts, each with one result of the same check. */
export function repeated(count: number, result: ResultSpec): AttemptSpec[] {
  return Array.from({ length: count }, () => ({ results: [result] }));
}
