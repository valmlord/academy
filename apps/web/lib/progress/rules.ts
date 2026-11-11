import type { AttemptStatus, CheckResultStatus, LessonProgressStatus } from "@academy/db";
import type { Check, Lesson } from "@academy/lesson-schema/schema";
import { CHECK_KIND_TRAITS, type CheckKind, SHIPPED_CHECK_KINDS } from "./shipped-kinds";

// The counting rules of ADR-0007 as amended by #101 (rules 1-8), in one pure module: the outcome
// writer, the check-state reads, the dashboard view and #34's start, result commit and finish all call
// it, so no rule is implemented twice. Type-only imports, no I/O and no clock.

export interface IncludedCheck {
  checkId: string;
  checkKind: CheckKind;
}

export interface AttemptFact {
  attemptId: string;
  status: AttemptStatus;
  startedAt: Date;
  finishedAt: Date | null;
  includedChecks: readonly IncludedCheck[];
}

export interface ResultFact {
  attemptId: string;
  attemptStartedAt: Date;
  checkId: string;
  checkKind: CheckKind;
  status: CheckResultStatus;
  isFormatError: boolean;
  isBudgetExhausted: boolean;
  message: string | null;
  rawError: string | null;
  /** numeric(12,6) as pg returns it; no arithmetic happens on it here. */
  costUsd: string | null;
  /** check_results.created_at: the check's end. */
  finishedAt: Date;
}

export interface ClosureFact {
  checkId: string;
  checkKind: CheckKind;
  closedAt: Date;
}

export interface LessonFacts {
  checks: readonly Check[];
  shippedKinds: ReadonlySet<CheckKind>;
  hasProgressRow: boolean;
  attempts: readonly AttemptFact[];
  results: readonly ResultFact[];
  closures: readonly ClosureFact[];
}

export type LessonOutcome = "not-started" | "in-progress" | "passed" | "not-passed";

export interface ResultEvaluation {
  attemptId: string;
  checkId: string;
  checkKind: CheckKind;
  status: CheckResultStatus;
  isCounted: boolean;
  isFormatError: boolean;
  isBudgetExhausted: boolean;
  message: string | null;
  rawError: string | null;
  costUsd: string | null;
  finishedAt: Date;
}

export interface CheckEvaluation {
  checkId: string;
  kind: CheckKind;
  isCounted: boolean;
  spendsTokens: boolean;
  maxSpendUsd: number | null;
  failedCount: number;
  attemptLimit: number | null;
  mentorAfter: number | null;
  hasPassed: boolean;
  isClosed: boolean;
  needsClosure: boolean;
  isInNextRun: boolean;
  latestResult: ResultEvaluation | null;
}

export interface FinishedAttemptSummary {
  attemptId: string;
  finishedAt: Date;
  includedCheckIds: string[];
  errorCheckCount: number;
}

export interface LessonEvaluation {
  checks: CheckEvaluation[];
  /**
   * Every result, stored rows and the missing results of finished attempts, in attempt order, each
   * with its isCounted; a result of a check id or kind that is not current is listed uncounted.
   */
  results: ResultEvaluation[];
  derivedOutcome: LessonOutcome;
  passedCount: number;
  countedCount: number;
  closedCount: number;
  lastAttemptCount: number;
  hasNextRun: boolean;
  runningAttemptId: string | null;
  latestFinishedAttempt: FinishedAttemptSummary | null;
}

export type RunPlan =
  | { kind: "run"; includedChecks: IncludedCheck[] }
  | { kind: "refused"; reason: "no-check-in-next-run" };

export const PRE_START_STAGES = [
  "exec-create",
  "exec-start",
  "checks-missing",
  "service-unreachable",
  "container-not-running",
] as const;
export type PreStartStage = (typeof PRE_START_STAGES)[number];

export const PLATFORM_STOP_REASONS = ["service-stop", "web-restart", "run-deadline"] as const;
export type PlatformStopReason = (typeof PLATFORM_STOP_REASONS)[number];

export type GraderEnd =
  | { end: "not-started"; stage: PreStartStage }
  | { end: "platform-stop"; reason: PlatformStopReason }
  | { end: "exit"; exitCode: number }
  | { end: "signal"; signal: string }
  | { end: "timeout-kill" }
  | { end: "container-ended" }
  | { end: "no-result" };

export interface ClassifiedResult {
  status: CheckResultStatus;
  isFormatError: boolean;
  rawError: string | null;
}

/** A finished attempt must carry its end; the DB guarantees it (attempts_finished_check). */
export class FinishedAttemptWithoutEndError extends Error {
  constructor(readonly attemptId: string) {
    super(`attempt ${attemptId} has left running but has no finished_at`);
    this.name = "FinishedAttemptWithoutEndError";
  }
}

/** Exit code 3 is the grader's format-error or stage-0 signal (ADR-0007 as amended, rule 3). */
const FORMAT_ERROR_EXIT_CODE = 3;

const COUNTABLE_STATUSES: ReadonlySet<CheckResultStatus> = new Set<CheckResultStatus>([
  "passed",
  "failed",
  "timeout",
]);

/** Maps how a grader ended to its stored result (rule 3, decision D11). */
export function classifyResult(end: GraderEnd): ClassifiedResult {
  switch (end.end) {
    case "not-started":
      return { status: "error", isFormatError: false, rawError: `pre-start: ${end.stage}` };
    case "platform-stop":
      return { status: "error", isFormatError: false, rawError: `platform-stop: ${end.reason}` };
    case "exit":
      if (end.exitCode === 0) {
        return { status: "passed", isFormatError: false, rawError: null };
      }
      return {
        status: "failed",
        isFormatError: end.exitCode === FORMAT_ERROR_EXIT_CODE,
        rawError: null,
      };
    case "timeout-kill":
      return { status: "timeout", isFormatError: false, rawError: null };
    // After the start, learner code can cause each of these, so each spends the attempt.
    case "signal":
    case "container-ended":
    case "no-result":
      return { status: "failed", isFormatError: false, rawError: null };
    default: {
      // A new GraderEnd form fails to compile here until it is mapped.
      const unmapped: never = end;
      return unmapped;
    }
  }
}

/**
 * The attempt's final status over its rows (ADR-0007 item 4 as amended, S2). The non-empty tuple
 * makes an empty list a type error: every caller holds a row for every included check.
 */
export function aggregateAttemptStatus(
  results: readonly [CheckResultStatus, ...CheckResultStatus[]],
): Exclude<AttemptStatus, "running"> {
  if (results.includes("error")) {
    return "error";
  }
  if (results.includes("failed") || results.includes("timeout")) {
    return "failed";
  }
  return "passed";
}

function byAttemptOrder(
  a: { startedAt: Date; attemptId: string },
  b: { startedAt: Date; attemptId: string },
): number {
  const byTime = a.startedAt.getTime() - b.startedAt.getTime();
  if (byTime !== 0) {
    return byTime;
  }
  if (a.attemptId === b.attemptId) {
    return 0;
  }
  return a.attemptId < b.attemptId ? -1 : 1;
}

/** Stored rows plus, for every attempt that left running, one failed result per rowless check. */
function resultsWithMissing(facts: LessonFacts): ResultFact[] {
  const stored = new Set(facts.results.map((result) => `${result.attemptId}\n${result.checkId}`));
  const missing: ResultFact[] = [];
  for (const attempt of facts.attempts) {
    if (attempt.status === "running") {
      continue;
    }
    if (attempt.finishedAt === null) {
      throw new FinishedAttemptWithoutEndError(attempt.attemptId);
    }
    for (const included of attempt.includedChecks) {
      if (stored.has(`${attempt.attemptId}\n${included.checkId}`)) {
        continue;
      }
      missing.push({
        attemptId: attempt.attemptId,
        attemptStartedAt: attempt.startedAt,
        checkId: included.checkId,
        checkKind: included.checkKind,
        status: "failed",
        isFormatError: false,
        isBudgetExhausted: false,
        message: null,
        rawError: null,
        costUsd: null,
        finishedAt: attempt.finishedAt,
      });
    }
  }
  return [...facts.results, ...missing].sort((a, b) =>
    byAttemptOrder(
      { startedAt: a.attemptStartedAt, attemptId: a.attemptId },
      { startedAt: b.attemptStartedAt, attemptId: b.attemptId },
    ),
  );
}

function toEvaluation(result: ResultFact, isCounted: boolean): ResultEvaluation {
  return {
    attemptId: result.attemptId,
    checkId: result.checkId,
    checkKind: result.checkKind,
    status: result.status,
    isCounted,
    isFormatError: result.isFormatError,
    isBudgetExhausted: result.isBudgetExhausted,
    message: result.message,
    rawError: result.rawError,
    costUsd: result.costUsd,
    finishedAt: result.finishedAt,
  };
}

interface CheckTally {
  hasPassed: boolean;
  failedCount: number;
  latestResult: ResultEvaluation | null;
}

function evaluateCheck(
  check: Check,
  tally: CheckTally,
  hasClosure: boolean,
  shippedKinds: ReadonlySet<CheckKind>,
): CheckEvaluation {
  const isCounted = shippedKinds.has(check.kind);
  const { spendsTokens } = CHECK_KIND_TRAITS[check.kind];
  const attemptLimit = check.attempts?.limit ?? null;
  const isClosed =
    !tally.hasPassed &&
    (hasClosure || (attemptLimit !== null && tally.failedCount >= attemptLimit));
  return {
    checkId: check.id,
    kind: check.kind,
    isCounted,
    spendsTokens,
    maxSpendUsd: check.kind === "hidden-task" ? check.budgetUsd : null,
    failedCount: tally.failedCount,
    attemptLimit,
    mentorAfter: check.attempts?.mentorAfter ?? null,
    hasPassed: tally.hasPassed,
    isClosed,
    needsClosure: isClosed && !hasClosure,
    isInNextRun: isCounted && !isClosed && !(spendsTokens && tally.hasPassed),
    latestResult: tally.latestResult,
  };
}

function deriveOutcome(
  hasProgressRow: boolean,
  counted: readonly CheckEvaluation[],
): LessonOutcome {
  if (!hasProgressRow) {
    return "not-started";
  }
  // A lesson with nothing to check cannot be finished by checking (deviation 3 of the #101 design).
  if (counted.length === 0) {
    return "in-progress";
  }
  if (counted.every((check) => check.hasPassed)) {
    return "passed";
  }
  const hasOpenCheck = counted.some((check) => !check.hasPassed && !check.isClosed);
  const hasClosedCheck = counted.some((check) => check.isClosed);
  return !hasOpenCheck && hasClosedCheck ? "not-passed" : "in-progress";
}

function summarizeLatestFinished(facts: LessonFacts): FinishedAttemptSummary | null {
  const finished = facts.attempts
    .filter((attempt) => attempt.status !== "running")
    .sort(byAttemptOrder);
  const latest = finished.at(-1);
  if (latest === undefined) {
    return null;
  }
  if (latest.finishedAt === null) {
    throw new FinishedAttemptWithoutEndError(latest.attemptId);
  }
  const errorCheckIds = new Set(
    facts.results
      .filter((result) => result.attemptId === latest.attemptId && result.status === "error")
      .map((result) => result.checkId),
  );
  const includedCheckIds = latest.includedChecks.map((included) => included.checkId);
  return {
    attemptId: latest.attemptId,
    finishedAt: latest.finishedAt,
    includedCheckIds,
    errorCheckCount: includedCheckIds.filter((checkId) => errorCheckIds.has(checkId)).length,
  };
}

/** Evaluates every counting rule of one learner's lesson from its stored facts (rules 1-6). */
export function evaluateLesson(facts: LessonFacts): LessonEvaluation {
  const currentKinds = new Map(facts.checks.map((check) => [check.id, check.kind]));
  const tallies = new Map<string, CheckTally>(
    facts.checks.map((check) => [
      check.id,
      { hasPassed: false, failedCount: 0, latestResult: null },
    ]),
  );
  const results: ResultEvaluation[] = [];
  for (const result of resultsWithMissing(facts)) {
    const tally = tallies.get(result.checkId);
    // Rule 2c: a result of a check id or kind that is not current is ignored by every field.
    if (tally === undefined || currentKinds.get(result.checkId) !== result.checkKind) {
      results.push(toEvaluation(result, false));
      continue;
    }
    const isCounted =
      !tally.hasPassed && COUNTABLE_STATUSES.has(result.status) && !result.isFormatError;
    if (isCounted && result.status === "passed") {
      tally.hasPassed = true;
    } else if (isCounted) {
      tally.failedCount += 1;
    }
    const evaluation = toEvaluation(result, isCounted);
    tally.latestResult = evaluation;
    results.push(evaluation);
  }

  const checks = facts.checks.map((check) => {
    const hasClosure = facts.closures.some(
      (closure) => closure.checkId === check.id && closure.checkKind === check.kind,
    );
    const tally = tallies.get(check.id) ?? { hasPassed: false, failedCount: 0, latestResult: null };
    return evaluateCheck(check, tally, hasClosure, facts.shippedKinds);
  });
  const counted = checks.filter((check) => check.isCounted);
  const runningAttempt = facts.attempts.find((attempt) => attempt.status === "running");

  return {
    checks,
    results,
    derivedOutcome: deriveOutcome(facts.hasProgressRow, counted),
    passedCount: counted.filter((check) => check.hasPassed).length,
    countedCount: counted.length,
    closedCount: counted.filter((check) => check.isClosed).length,
    lastAttemptCount: counted.filter(
      (check) =>
        !check.hasPassed &&
        !check.isClosed &&
        check.attemptLimit !== null &&
        check.attemptLimit - check.failedCount === 1,
    ).length,
    hasNextRun: checks.some((check) => check.isInNextRun),
    runningAttemptId: runningAttempt?.attemptId ?? null,
    latestFinishedAttempt: summarizeLatestFinished(facts),
  };
}

/** The included set of the next run (rule 5); never empty. */
export function composeRun(evaluation: LessonEvaluation): RunPlan {
  const includedChecks = evaluation.checks
    .filter((check) => check.isInNextRun)
    .map((check) => ({ checkId: check.checkId, checkKind: check.kind }));
  if (includedChecks.length === 0) {
    return { kind: "refused", reason: "no-check-in-next-run" };
  }
  return { kind: "run", includedChecks };
}

/** Counted checks of a lesson as the dashboard counts them (rule 8). */
export function countedCheckCount(
  lesson: Lesson,
  shippedKinds: ReadonlySet<CheckKind> = SHIPPED_CHECK_KINDS,
): number {
  return lesson.checks.filter((check) => shippedKinds.has(check.kind)).length;
}

/** The status the writer stores (rule 4): `completed` is sticky, everything else follows the facts. */
export function nextStoredStatus(
  current: LessonProgressStatus,
  derived: Exclude<LessonOutcome, "not-started">,
): LessonProgressStatus {
  if (current === "completed") {
    return "completed";
  }
  switch (derived) {
    case "passed":
      return "completed";
    case "not-passed":
      return "not-passed";
    case "in-progress":
      return "in-progress";
  }
}

/** What every page shows for a stored status; no row is not started. */
export function storedOutcome(status: LessonProgressStatus | null): LessonOutcome {
  switch (status) {
    case null:
      return "not-started";
    case "completed":
      return "passed";
    case "in-progress":
      return "in-progress";
    case "not-passed":
      return "not-passed";
  }
}
