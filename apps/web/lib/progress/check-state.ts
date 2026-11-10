import {
  type AttemptStatus,
  attempts,
  type CheckResultStatus,
  type Database,
  type LessonProgressStatus,
  lessonProgress,
} from "@academy/db";
import type { Check, Lesson } from "@academy/lesson-schema/schema";
import { and, eq } from "drizzle-orm";
import {
  type DbTransaction,
  type LessonKey,
  loadLessonFacts,
  type StoredLessonFacts,
} from "./facts";
import type { OutcomeTarget } from "./outcome-writer";
import {
  type AttemptFact,
  evaluateLesson,
  type LessonEvaluation,
  type LessonOutcome,
  type ResultEvaluation,
  storedOutcome,
} from "./rules";
import { type CheckKind, SHIPPED_CHECK_KINDS } from "./shipped-kinds";

// Server-only reads of the check panel (ADR-0007 as amended by #101; ADR-0009 item 3 as amended). Every
// field is copied by name, so no grader field (run, file, rubric, task, verify, answers) can reach a
// browser through a spread. Results come only from the database snapshot; the live port adds only which
// checks are running and since when. No route, action or page calls these in #101 (D8 Q14).

/** Which included checks of a running attempt have a running grader, by check id, with the grader's start. */
export interface LiveAttemptSource {
  runningChecks(attemptId: string): ReadonlyMap<string, Date>;
}

const NO_RUNNING_CHECKS: ReadonlyMap<string, Date> = new Map();

/** Every check without a row reads "queued". */
export const NO_LIVE_PROGRESS: LiveAttemptSource = { runningChecks: () => NO_RUNNING_CHECKS };

export interface ResultView {
  attemptId: string;
  status: CheckResultStatus;
  isCounted: boolean;
  isFormatError: boolean;
  isBudgetExhausted: boolean;
  details: string | null;
  rawError: string | null;
  costUsd: number | null;
  finishedAt: Date;
}

export interface CheckView {
  checkId: string;
  kind: CheckKind;
  title: string;
  timeoutSec: number | null;
  isCounted: boolean;
  spendsTokens: boolean;
  maxSpendUsd: number | null;
  failedCount: number;
  attemptLimit: number | null;
  mentorAfter: number | null;
  hasPassed: boolean;
  isClosed: boolean;
  isInNextRun: boolean;
  latestResult: ResultView | null;
}

export type AttemptCheckState = "queued" | "running" | "done";

export interface AttemptCheckView {
  checkId: string;
  state: AttemptCheckState;
  runningStartedAt: Date | null;
  result: ResultView | null;
}

export interface AttemptView {
  attemptId: string;
  status: AttemptStatus;
  startedAt: Date;
  finishedAt: Date | null;
  includedCheckIds: string[];
  checks: AttemptCheckView[];
}

export interface LatestFinishedAttemptView {
  attemptId: string;
  finishedAt: Date;
  includedCheckIds: string[];
  errorCheckCount: number;
}

export interface CheckStateView {
  checks: CheckView[];
  outcome: LessonOutcome;
  passedCount: number;
  countedCount: number;
  closedCount: number;
  lastAttemptCount: number;
  hasNextRun: boolean;
  runningAttemptId: string | null;
  latestFinishedAttempt: LatestFinishedAttemptView | null;
  runningAttempt: AttemptView | null;
}

export interface ReadDeps {
  shippedKinds?: ReadonlySet<CheckKind>;
  live?: LiveAttemptSource;
}

function toResultView(result: ResultEvaluation): ResultView {
  return {
    attemptId: result.attemptId,
    status: result.status,
    isCounted: result.isCounted,
    isFormatError: result.isFormatError,
    isBudgetExhausted: result.isBudgetExhausted,
    details: result.message,
    rawError: result.rawError,
    // numeric(12,6) holds at most 12 significant digits, exact in a double to display precision.
    costUsd: result.costUsd === null ? null : Number(result.costUsd),
    finishedAt: result.finishedAt,
  };
}

function timeoutOf(check: Check): number | null {
  return check.kind === "command" || check.kind === "hidden-task" ? check.timeoutSec : null;
}

/**
 * Per included check, in included order: a committed row wins (also while the attempt runs, whatever
 * the port says); a finished attempt's check without a row shows its missing result; a running
 * attempt's check without a row is running when the port lists it, else queued.
 */
export function toAttemptView(
  attempt: AttemptFact,
  evaluation: LessonEvaluation,
  running: ReadonlyMap<string, Date>,
): AttemptView {
  const results = new Map(
    evaluation.results
      .filter((result) => result.attemptId === attempt.attemptId)
      .map((result) => [result.checkId, result]),
  );
  return {
    attemptId: attempt.attemptId,
    status: attempt.status,
    startedAt: attempt.startedAt,
    finishedAt: attempt.finishedAt,
    includedCheckIds: attempt.includedChecks.map((included) => included.checkId),
    checks: attempt.includedChecks.map(({ checkId }): AttemptCheckView => {
      const result = results.get(checkId);
      if (result !== undefined) {
        return { checkId, state: "done", runningStartedAt: null, result: toResultView(result) };
      }
      const runningStartedAt = running.get(checkId);
      if (attempt.status === "running" && runningStartedAt !== undefined) {
        return { checkId, state: "running", runningStartedAt, result: null };
      }
      return { checkId, state: "queued", runningStartedAt: null, result: null };
    }),
  };
}

export function toCheckStateView(
  lesson: Lesson,
  evaluation: LessonEvaluation,
  stored: LessonProgressStatus | null,
  runningAttempt: AttemptView | null,
): CheckStateView {
  const evaluated = new Map(evaluation.checks.map((check) => [check.checkId, check]));
  const checks: CheckView[] = [];
  for (const check of lesson.checks) {
    const state = evaluated.get(check.id);
    if (state === undefined) continue;
    checks.push({
      checkId: check.id,
      kind: check.kind,
      title: check.title,
      timeoutSec: timeoutOf(check),
      isCounted: state.isCounted,
      spendsTokens: state.spendsTokens,
      maxSpendUsd: state.maxSpendUsd,
      failedCount: state.failedCount,
      attemptLimit: state.attemptLimit,
      mentorAfter: state.mentorAfter,
      hasPassed: state.hasPassed,
      isClosed: state.isClosed,
      isInNextRun: state.isInNextRun,
      latestResult: state.latestResult === null ? null : toResultView(state.latestResult),
    });
  }
  const latest = evaluation.latestFinishedAttempt;
  return {
    checks,
    // The stored value, so every page shows the same outcome (D5: a completed lesson stays passed).
    outcome: storedOutcome(stored),
    passedCount: evaluation.passedCount,
    countedCount: evaluation.countedCount,
    closedCount: evaluation.closedCount,
    lastAttemptCount: evaluation.lastAttemptCount,
    hasNextRun: evaluation.hasNextRun,
    runningAttemptId: evaluation.runningAttemptId,
    latestFinishedAttempt:
      latest === null
        ? null
        : {
            attemptId: latest.attemptId,
            finishedAt: latest.finishedAt,
            includedCheckIds: [...latest.includedCheckIds],
            errorCheckCount: latest.errorCheckCount,
          },
    runningAttempt,
  };
}

function lessonKey(target: OutcomeTarget): LessonKey {
  return { userId: target.userId, courseId: target.courseId, lessonId: target.lesson.id };
}

async function storedStatus(
  executor: Database | DbTransaction,
  key: LessonKey,
): Promise<LessonProgressStatus | null> {
  const [row] = await executor
    .select({ status: lessonProgress.status })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, key.userId),
        eq(lessonProgress.courseId, key.courseId),
        eq(lessonProgress.lessonId, key.lessonId),
      ),
    );
  return row?.status ?? null;
}

async function runningAttemptId(db: Database, key: LessonKey): Promise<string | null> {
  const [row] = await db
    .select({ id: attempts.id })
    .from(attempts)
    .where(
      and(
        eq(attempts.userId, key.userId),
        eq(attempts.courseId, key.courseId),
        eq(attempts.lessonId, key.lessonId),
        eq(attempts.status, "running"),
      ),
    );
  return row?.id ?? null;
}

interface Snapshot {
  stored: LessonProgressStatus | null;
  facts: StoredLessonFacts;
  evaluation: LessonEvaluation;
}

/** Status, attempts, results and closures from one snapshot (ADR-0007 forbids REPEATABLE READ only for writers). */
async function readSnapshot(
  db: Database,
  target: OutcomeTarget,
  shippedKinds: ReadonlySet<CheckKind>,
): Promise<Snapshot> {
  const key = lessonKey(target);
  return db.transaction(
    async (tx) => {
      const stored = await storedStatus(tx, key);
      const facts = await loadLessonFacts(tx, key);
      const evaluation = evaluateLesson({
        checks: target.lesson.checks,
        shippedKinds,
        hasProgressRow: stored !== null,
        ...facts,
      });
      return { stored, facts, evaluation };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

/**
 * The port is read before the snapshot opens: a check that ended before the port read leaves the port
 * only after its row committed, so the snapshot has the row. The running attempt's id comes from a query
 * of its own before that, because the snapshot is taken at its first statement.
 */
export async function readCheckState(
  db: Database,
  target: OutcomeTarget,
  deps: ReadDeps = {},
): Promise<CheckStateView> {
  const live = deps.live ?? NO_LIVE_PROGRESS;
  const portAttemptId = await runningAttemptId(db, lessonKey(target));
  const running = portAttemptId === null ? NO_RUNNING_CHECKS : live.runningChecks(portAttemptId);
  const { stored, facts, evaluation } = await readSnapshot(
    db,
    target,
    deps.shippedKinds ?? SHIPPED_CHECK_KINDS,
  );
  const attempt = facts.attempts.find(
    (candidate) => candidate.attemptId === evaluation.runningAttemptId,
  );
  // An attempt that started after the port read has no live entries yet: its checks read queued.
  const attemptRunning = attempt?.attemptId === portAttemptId ? running : NO_RUNNING_CHECKS;
  const runningAttempt =
    attempt === undefined ? null : toAttemptView(attempt, evaluation, attemptRunning);
  return toCheckStateView(target.lesson, evaluation, stored, runningAttempt);
}

/** Null for an unknown id, another user's attempt and an attempt of another lesson alike. */
export async function readAttempt(
  db: Database,
  target: OutcomeTarget & { attemptId: string },
  deps: ReadDeps = {},
): Promise<AttemptView | null> {
  const running = (deps.live ?? NO_LIVE_PROGRESS).runningChecks(target.attemptId);
  const { facts, evaluation } = await readSnapshot(
    db,
    target,
    deps.shippedKinds ?? SHIPPED_CHECK_KINDS,
  );
  const attempt = facts.attempts.find((candidate) => candidate.attemptId === target.attemptId);
  return attempt === undefined ? null : toAttemptView(attempt, evaluation, running);
}
