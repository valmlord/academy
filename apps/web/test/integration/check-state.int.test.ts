import { attempts, CHECK_KINDS, checkResults } from "@academy/db";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import {
  type LiveAttemptSource,
  NO_LIVE_PROGRESS,
  readAttempt,
  readCheckState,
} from "@/lib/progress/check-state";
import {
  applyLessonOutcome,
  type OutcomeTarget,
  recomputeLessonOutcome,
} from "@/lib/progress/outcome-writer";
import { aggregateAttemptStatus, classifyResult, type IncludedCheck } from "@/lib/progress/rules";
import { commandCheck, lessonWith, quizCheck } from "@/test/progress-facts";
import { type TestDatabase, testDatabase } from "./db";
import {
  COURSE_ID,
  failures,
  finishAttempt,
  finishedAttempt,
  insertAttempt,
  insertResult,
  type SeededLesson,
  seedProgress,
  seedUser,
} from "./progress-seed";

// I-read (#101 design 7.2): the check-state and attempt reads against a migrated database.

let database: TestDatabase | undefined;

afterEach(async () => {
  await database?.drop();
  database = undefined;
});

const USER = "user_a";
const OTHER = "user_b";
const CHECK_A = commandCheck("a", { limit: 3, mentorAfter: 2 });
const CHECKS = [CHECK_A, commandCheck("b"), commandCheck("c"), quizCheck("q", { limit: 3 })];
const LESSON = lessonWith(CHECKS);
const KEY: SeededLesson = { userId: USER, courseId: COURSE_ID, lessonId: LESSON.id };
const OTHER_KEY: SeededLesson = { ...KEY, userId: OTHER };
const TARGET: OutcomeTarget = { userId: USER, courseId: COURSE_ID, lesson: LESSON };
const ABC: IncludedCheck[] = ["a", "b", "c"].map((checkId) => ({ checkId, checkKind: "command" }));

async function seeded(): Promise<TestDatabase> {
  database = await testDatabase();
  await seedProgress(database.db, KEY);
  return database;
}

function portListing(attemptId: string, running: Record<string, Date>): LiveAttemptSource {
  return {
    runningChecks: (id) => new Map(id === attemptId ? Object.entries(running) : []),
  };
}

async function resultCreatedAt(
  db: TestDatabase,
  attemptId: string,
  checkId: string,
): Promise<Date> {
  const rows = await db.db
    .select({ checkId: checkResults.checkId, createdAt: checkResults.createdAt })
    .from(checkResults)
    .where(eq(checkResults.attemptId, attemptId));
  const match = rows.find((candidate) => candidate.checkId === checkId);
  if (match === undefined) throw new Error(`no result ${attemptId}/${checkId}`);
  return match.createdAt;
}

async function attemptFinishedAt(db: TestDatabase, attemptId: string): Promise<Date | null> {
  const [row] = await db.db
    .select({ finishedAt: attempts.finishedAt })
    .from(attempts)
    .where(eq(attempts.id, attemptId));
  return row?.finishedAt ?? null;
}

/**
 * The startup sweep shape of R34-14: a web-restart error for every included check without a row, then
 * the attempt's status over the rows present after those inserts, then the writer, in one transaction.
 */
async function sweep(db: TestDatabase, attemptId: string): Promise<void> {
  await db.db.transaction(
    async (tx) => {
      const [attempt] = await tx.select().from(attempts).where(eq(attempts.id, attemptId));
      if (attempt === undefined) throw new Error(`no attempt ${attemptId}`);
      const stop = classifyResult({ end: "platform-stop", reason: "web-restart" });
      for (const [position, checkId] of attempt.includedCheckIds.entries()) {
        const checkKind = CHECK_KINDS.find((kind) => kind === attempt.includedCheckKinds[position]);
        if (checkKind === undefined)
          throw new Error(`attempt ${attemptId} has no kind at ${position}`);
        await tx
          .insert(checkResults)
          .values({
            attemptId,
            checkId,
            checkKind,
            status: stop.status,
            isFormatError: stop.isFormatError,
            rawError: stop.rawError,
          })
          .onConflictDoNothing();
      }
      const rows = await tx
        .select({ status: checkResults.status })
        .from(checkResults)
        .where(eq(checkResults.attemptId, attemptId));
      const [first, ...rest] = rows.map((row) => row.status);
      if (first === undefined) throw new Error(`attempt ${attemptId} has no rows`);
      await finishAttempt(tx, attemptId, aggregateAttemptStatus([first, ...rest]));
      await applyLessonOutcome(tx, TARGET);
    },
    { isolationLevel: "read committed" },
  );
}

/** #34's per-check commit (R34-3): the row, then the writer, in one READ COMMITTED transaction. */
async function commitResult(db: TestDatabase, attemptId: string, checkId: string): Promise<void> {
  await db.db.transaction(
    async (tx) => {
      await insertResult(tx, attemptId, { checkId, status: "failed" });
      await applyLessonOutcome(tx, TARGET);
    },
    { isolationLevel: "read committed" },
  );
}

function checkOf<T extends { checkId: string }>(checks: readonly T[], checkId: string): T {
  const check = checks.find((candidate) => candidate.checkId === checkId);
  if (check === undefined) throw new Error(`no check ${checkId} in the view`);
  return check;
}

describe("I-read readCheckState and readAttempt", () => {
  it("I-read-1 reports a lesson with no progress row as not started with a counted check in the next run", async () => {
    database = await testDatabase();
    await seedUser(database.db, USER);

    const view = await readCheckState(database.db, TARGET);

    expect(view).toMatchObject({
      outcome: "not-started",
      hasNextRun: true,
      lastAttemptCount: 0,
      runningAttemptId: null,
      runningAttempt: null,
      latestFinishedAttempt: null,
    });
    expect(checkOf(view.checks, "a")).toMatchObject({
      title: "Check a",
      timeoutSec: 60,
      isCounted: true,
      isInNextRun: true,
    });
    expect(checkOf(view.checks, "q")).toMatchObject({
      timeoutSec: null,
      isCounted: false,
      isInNextRun: false,
    });
  });

  it("I-read-2 reports the failed count, limits and the latest result's flags, message, cost and end", async () => {
    const db = await seeded();
    await finishedAttempt(db.db, KEY, [{ checkId: "a", status: "failed", message: "older" }]);
    const latest = await finishedAttempt(db.db, KEY, [
      {
        checkId: "a",
        status: "failed",
        isFormatError: true,
        message: "line 2: expected a number",
        costUsd: "0.012345",
      },
    ]);

    const view = await readCheckState(db.db, TARGET);

    expect(checkOf(view.checks, "a")).toMatchObject({
      failedCount: 1,
      attemptLimit: 3,
      mentorAfter: 2,
      latestResult: {
        attemptId: latest,
        status: "failed",
        isCounted: false,
        isFormatError: true,
        isBudgetExhausted: false,
        details: "line 2: expected a number",
        rawError: null,
        costUsd: 0.012345,
        finishedAt: await resultCreatedAt(db, latest, "a"),
      },
    });
  });

  it("I-read-3 shows a running attempt's committed result as done and counted, a listed check as running and the rest as queued", async () => {
    const db = await seeded();
    const running = await insertAttempt(db.db, KEY, { status: "running", included: ABC });
    await commitResult(db, running, "a");
    const startedB = new Date(Date.UTC(2026, 10, 10, 8));

    const view = await readCheckState(db.db, TARGET, {
      live: portListing(running, { b: startedB }),
    });
    const withoutPort = await readCheckState(db.db, TARGET, { live: NO_LIVE_PROGRESS });
    const portListsA = await readCheckState(db.db, TARGET, {
      live: portListing(running, { a: startedB, b: startedB }),
    });

    expect(view.runningAttemptId).toBe(running);
    expect(checkOf(view.checks, "a").failedCount).toBe(1);
    const checks = view.runningAttempt?.checks ?? [];
    expect(checkOf(checks, "a")).toMatchObject({
      state: "done",
      runningStartedAt: null,
      result: {
        status: "failed",
        isCounted: true,
        finishedAt: await resultCreatedAt(db, running, "a"),
      },
    });
    expect(checkOf(checks, "b")).toEqual({
      checkId: "b",
      state: "running",
      runningStartedAt: startedB,
      result: null,
    });
    expect(checkOf(checks, "c").state).toBe("queued");
    expect(withoutPort.runningAttempt?.checks.map((check) => check.state)).toEqual([
      "done",
      "queued",
      "queued",
    ]);
    expect(checkOf(portListsA.runningAttempt?.checks ?? [], "a").state).toBe("done");
  });

  it("I-read-4 never shows another user's attempts, results or closures", async () => {
    const db = await seeded();
    await seedProgress(db.db, OTHER_KEY);
    await finishedAttempt(db.db, OTHER_KEY, [{ checkId: "a", status: "passed" }]);
    await failures(db.db, OTHER_KEY, 3, "b");
    await recomputeLessonOutcome(db.db, {
      ...TARGET,
      userId: OTHER,
      lesson: lessonWith([CHECK_A, commandCheck("b", { limit: 3 })]),
    });

    const view = await readCheckState(db.db, TARGET);

    expect(checkOf(view.checks, "a")).toMatchObject({
      hasPassed: false,
      failedCount: 0,
      latestResult: null,
    });
    expect(checkOf(view.checks, "b")).toMatchObject({ failedCount: 0, isClosed: false });
    expect(view).toMatchObject({
      passedCount: 0,
      closedCount: 0,
      latestFinishedAttempt: null,
      outcome: "in-progress",
    });
  });

  it("I-read-5 reports the outcome the writer stored, not-passed included", async () => {
    const db = await seeded();
    await failures(db.db, KEY, 3, "a");
    const onlyA = { ...TARGET, lesson: lessonWith([commandCheck("a", { limit: 3 })]) };
    const write = await recomputeLessonOutcome(db.db, onlyA);

    const view = await readCheckState(db.db, onlyA);

    expect(write.status).toBe("not-passed");
    expect(view.outcome).toBe("not-passed");
    expect(checkOf(view.checks, "a").isClosed).toBe(true);
  });

  it("I-read-6 counts errors of a swept attempt only in errorCheckCount, and a missing row of a finished attempt as a failure", async () => {
    const db = await seeded();
    const swept = await insertAttempt(db.db, KEY, { status: "running", included: ABC });
    await sweep(db, swept);
    const afterSweep = await readCheckState(db.db, TARGET);
    const gap = await insertAttempt(db.db, KEY, {
      status: "failed",
      included: [
        { checkId: "a", checkKind: "command" },
        { checkId: "b", checkKind: "command" },
      ],
    });
    await insertResult(db.db, gap, { checkId: "b", status: "passed" });

    const afterGap = await readCheckState(db.db, TARGET);

    expect(afterSweep.latestFinishedAttempt).toMatchObject({
      attemptId: swept,
      errorCheckCount: 3,
    });
    expect(checkOf(afterSweep.checks, "a").failedCount).toBe(0);
    expect(checkOf(afterGap.checks, "a")).toMatchObject({
      failedCount: 1,
      latestResult: {
        attemptId: gap,
        status: "failed",
        isCounted: true,
        details: null,
        finishedAt: await attemptFinishedAt(db, gap),
      },
    });
    expect(afterGap.latestFinishedAttempt).toMatchObject({ attemptId: gap, errorCheckCount: 0 });
  });

  it("I-read-7 moves latestFinishedAttempt to a second attempt once it finishes", async () => {
    const db = await seeded();
    const first = await finishedAttempt(db.db, KEY, [{ checkId: "a", status: "failed" }]);
    const second = await insertAttempt(db.db, KEY, {
      status: "running",
      included: [{ checkId: "a", checkKind: "command" }],
    });
    const whileRunning = await readCheckState(db.db, TARGET);
    await insertResult(db.db, second, { checkId: "a", status: "failed" });
    await finishAttempt(db.db, second, "failed");

    const afterFinish = await readCheckState(db.db, TARGET);

    expect(whileRunning.latestFinishedAttempt?.attemptId).toBe(first);
    expect(afterFinish.latestFinishedAttempt?.attemptId).toBe(second);
    expect(afterFinish.runningAttemptId).toBeNull();
  });

  it("I-read-8 reads a finished attempt with every included check done, and a running one with its live states", async () => {
    const db = await seeded();
    const finished = await finishedAttempt(db.db, KEY, [
      { checkId: "a", status: "failed", message: "two of three" },
      { checkId: "b", status: "passed" },
    ]);
    const running = await insertAttempt(db.db, KEY, { status: "running", included: ABC });
    await commitResult(db, running, "a");
    const startedB = new Date(Date.UTC(2026, 10, 10, 8));

    const finishedView = await readAttempt(db.db, { ...TARGET, attemptId: finished });
    const runningView = await readAttempt(
      db.db,
      { ...TARGET, attemptId: running },
      { live: portListing(running, { b: startedB }) },
    );

    expect(finishedView).toMatchObject({
      attemptId: finished,
      status: "failed",
      includedCheckIds: ["a", "b"],
      finishedAt: await attemptFinishedAt(db, finished),
    });
    expect(finishedView?.checks).toEqual([
      {
        checkId: "a",
        state: "done",
        runningStartedAt: null,
        result: expect.objectContaining({
          status: "failed",
          isCounted: true,
          details: "two of three",
          finishedAt: await resultCreatedAt(db, finished, "a"),
        }),
      },
      {
        checkId: "b",
        state: "done",
        runningStartedAt: null,
        result: expect.objectContaining({
          status: "passed",
          isCounted: true,
          finishedAt: await resultCreatedAt(db, finished, "b"),
        }),
      },
    ]);
    expect(runningView?.status).toBe("running");
    expect(runningView?.checks.map((check) => [check.checkId, check.state])).toEqual([
      ["a", "done"],
      ["b", "running"],
      ["c", "queued"],
    ]);
  });

  it("I-read-9 returns null for another user's attempt, an unknown id and an attempt of another lesson", async () => {
    const db = await seeded();
    await seedProgress(db.db, OTHER_KEY);
    const foreign = await finishedAttempt(db.db, OTHER_KEY, [{ checkId: "a", status: "failed" }]);
    const otherLessonKey = { ...KEY, lessonId: "another-lesson" };
    await seedProgress(db.db, otherLessonKey);
    const otherLesson = await finishedAttempt(db.db, otherLessonKey, [
      { checkId: "a", status: "failed" },
    ]);
    const own = await finishedAttempt(db.db, KEY, [{ checkId: "a", status: "failed" }]);

    const reads = await Promise.all(
      [foreign, "00000000-0000-4000-8000-000000000000", otherLesson, own].map((attemptId) =>
        readAttempt(db.db, { ...TARGET, attemptId }),
      ),
    );

    expect(reads.map((read) => read?.attemptId ?? null)).toEqual([null, null, null, own]);
  });

  it("I-read-10 reports the last attempt of a check one failure before its limit, and none after the closing failure", async () => {
    const db = await seeded();
    await failures(db.db, KEY, 2, "a");
    const before = await readCheckState(db.db, TARGET);
    await failures(db.db, KEY, 1, "a");
    await recomputeLessonOutcome(db.db, TARGET);

    const after = await readCheckState(db.db, TARGET);

    expect(before).toMatchObject({ lastAttemptCount: 1, closedCount: 0 });
    expect(after).toMatchObject({ lastAttemptCount: 0, closedCount: 1 });
  });

  it("I-read-11 keeps a committed result counted after the finish transaction rolls back", async () => {
    const db = await seeded();
    const running = await insertAttempt(db.db, KEY, {
      status: "running",
      included: [
        { checkId: "a", checkKind: "command" },
        { checkId: "b", checkKind: "command" },
      ],
    });
    await commitResult(db, running, "a");
    const shown = await readCheckState(db.db, TARGET);
    const rolledBack = db.db.transaction(
      async (tx) => {
        await finishAttempt(tx, running, "failed");
        await applyLessonOutcome(tx, TARGET);
        throw new Error("the finish failed after its update");
      },
      { isolationLevel: "read committed" },
    );
    await expect(rolledBack).rejects.toThrow("the finish failed after its update");

    const afterRollback = await readCheckState(db.db, TARGET);

    expect(checkOf(shown.checks, "a").failedCount).toBe(1);
    expect(checkOf(afterRollback.checks, "a")).toMatchObject({
      failedCount: 1,
      latestResult: { attemptId: running, isCounted: true },
    });
    expect(afterRollback.runningAttempt?.status).toBe("running");
  });

  it("I-read-12 keeps a committed result counted after a sweep marks its attempt error", async () => {
    const db = await seeded();
    const running = await insertAttempt(db.db, KEY, {
      status: "running",
      included: [
        { checkId: "a", checkKind: "command" },
        { checkId: "b", checkKind: "command" },
      ],
    });
    await commitResult(db, running, "a");
    const shown = await readCheckState(db.db, TARGET);

    await sweep(db, running);
    const afterSweep = await readCheckState(db.db, TARGET);

    expect(checkOf(shown.checks, "a").failedCount).toBe(1);
    expect(checkOf(afterSweep.checks, "a")).toMatchObject({
      failedCount: 1,
      latestResult: { attemptId: running, status: "failed", isCounted: true },
    });
    expect(checkOf(afterSweep.checks, "b")).toMatchObject({
      failedCount: 0,
      latestResult: { status: "error", isCounted: false, rawError: "platform-stop: web-restart" },
    });
    expect(afterSweep.latestFinishedAttempt).toMatchObject({
      attemptId: running,
      errorCheckCount: 1,
    });
  });

  it("I-read-13 ends a swept attempt whose every row committed as failed, with no new row", async () => {
    const db = await seeded();
    const running = await insertAttempt(db.db, KEY, {
      status: "running",
      included: [
        { checkId: "a", checkKind: "command" },
        { checkId: "b", checkKind: "command" },
      ],
    });
    await commitResult(db, running, "a");
    await commitResult(db, running, "b");
    const beforeSweep = await readCheckState(db.db, TARGET);

    await sweep(db, running);
    const view = await readAttempt(db.db, { ...TARGET, attemptId: running });
    const state = await readCheckState(db.db, TARGET);

    expect(view?.status).toBe("failed");
    expect(view?.checks.map((check) => [check.state, check.result?.isCounted])).toEqual([
      ["done", true],
      ["done", true],
    ]);
    expect(state.latestFinishedAttempt).toMatchObject({ attemptId: running, errorCheckCount: 0 });
    for (const checkId of ["a", "b"]) {
      expect(checkOf(state.checks, checkId).failedCount).toBe(
        checkOf(beforeSweep.checks, checkId).failedCount,
      );
    }
    expect(checkOf(state.checks, "a").failedCount).toBe(1);
  });
});
