import { createDb } from "@academy/db";
import type { Check } from "@academy/lesson-schema/schema";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { dbErrorCode } from "@/lib/db-error";
import {
  applyLessonOutcome,
  LessonProgressMissingError,
  OutcomeIsolationError,
  type OutcomeTarget,
  type OutcomeWrite,
  recomputeLessonOutcome,
} from "@/lib/progress/outcome-writer";
import type { CheckKind } from "@/lib/progress/shipped-kinds";
import { commandCheck, lessonWith, quizCheck } from "@/test/progress-facts";
import { type TestDatabase, testDatabase } from "./db";
import {
  COURSE_ID,
  failures,
  finishedAttempt,
  insertAttempt,
  insertResult,
  type SeededLesson,
  seedProgress,
} from "./progress-seed";

// I-out (#101 design 6.5): the outcome writer against a migrated database. One fresh database per test.

let database: TestDatabase | undefined;

afterEach(async () => {
  await database?.drop();
  database = undefined;
});

const USER = "user_a";
const LESSON_ID = lessonWith([]).id;
const KEY: SeededLesson = { userId: USER, courseId: COURSE_ID, lessonId: LESSON_ID };

function target(checks: Check[], userId = USER): OutcomeTarget {
  return { userId, courseId: COURSE_ID, lesson: lessonWith(checks) };
}

async function seeded(status?: "in-progress" | "completed" | "not-passed"): Promise<TestDatabase> {
  database = await testDatabase();
  await seedProgress(database.db, KEY, status);
  return database;
}

// Timestamps as text, so a call that rewrote the row would show.
const PROGRESS = `SELECT user_id, status, updated_at::text AS updated_at, completed_at::text AS completed_at
  FROM lesson_progress ORDER BY user_id`;
const CLOSURES = `SELECT user_id, check_id, check_kind, attempt_limit, failed_count,
  closed_at::text AS closed_at FROM check_closures ORDER BY user_id, check_id, check_kind`;

async function statusOf(db: TestDatabase, userId = USER): Promise<unknown> {
  const rows = await db.rows(PROGRESS);
  return rows.find((row) => row.user_id === userId)?.status;
}

describe("I-out applyLessonOutcome", () => {
  it("I-out-1 sets completed with completed_at when every counted check has passed, and a second call changes nothing", async () => {
    const db = await seeded();
    await finishedAttempt(db.db, KEY, [{ checkId: "a", status: "passed" }]);
    const lesson = target([commandCheck("a")]);

    const first = await recomputeLessonOutcome(db.db, lesson);
    const progressAfterFirst = await db.rows(PROGRESS);
    const second = await recomputeLessonOutcome(db.db, lesson);

    expect(first).toEqual({ status: "completed", isChanged: true, closedCheckIds: [] });
    expect(progressAfterFirst[0]).toMatchObject({
      status: "completed",
      completed_at: expect.any(String),
    });
    expect(second).toEqual({ status: "completed", isChanged: false, closedCheckIds: [] });
    expect(await db.rows(PROGRESS)).toEqual(progressAfterFirst);
  });

  it("I-out-2 persists the closure with the check's kind at the counted failure that reaches the limit and sets not-passed", async () => {
    const db = await seeded();
    const lesson = target([commandCheck("a", { limit: 3 })]);
    await failures(db.db, KEY, 2, "a");
    const beforeLimit = await recomputeLessonOutcome(db.db, lesson);
    await failures(db.db, KEY, 1, "a");

    const atLimit = await recomputeLessonOutcome(db.db, lesson);

    expect(beforeLimit).toEqual({ status: "in-progress", isChanged: false, closedCheckIds: [] });
    expect(atLimit).toEqual({ status: "not-passed", isChanged: true, closedCheckIds: ["a"] });
    expect(await db.rows(CLOSURES)).toEqual([
      expect.objectContaining({
        check_id: "a",
        check_kind: "command",
        attempt_limit: 3,
        failed_count: 3,
      }),
    ]);
  });

  it("I-out-3 keeps the closure and not-passed after the limit is raised", async () => {
    const db = await seeded();
    await failures(db.db, KEY, 10, "a");
    await recomputeLessonOutcome(db.db, target([commandCheck("a", { limit: 10 })]));
    const closures = await db.rows(CLOSURES);

    const raised = await recomputeLessonOutcome(db.db, target([commandCheck("a", { limit: 20 })]));

    expect(raised).toEqual({ status: "not-passed", isChanged: false, closedCheckIds: [] });
    expect(await db.rows(CLOSURES)).toEqual(closures);
    expect(closures).toHaveLength(1);
  });

  it("I-out-3b reopens a check whose kind changed and closes it again under the new kind", async () => {
    const db = await seeded();
    const shipped: ReadonlySet<CheckKind> = new Set<CheckKind>(["command", "quiz"]);
    await failures(db.db, KEY, 10, "x");
    await recomputeLessonOutcome(db.db, target([commandCheck("x", { limit: 10 })]), shipped);
    const asQuiz = target([quizCheck("x", { limit: 3 })]);

    const afterChange = await recomputeLessonOutcome(db.db, asQuiz, shipped);
    await failures(db.db, KEY, 3, "x", "quiz");
    const afterQuizFailures = await recomputeLessonOutcome(db.db, asQuiz, shipped);

    expect(afterChange).toEqual({ status: "in-progress", isChanged: true, closedCheckIds: [] });
    expect(afterQuizFailures).toEqual({
      status: "not-passed",
      isChanged: true,
      closedCheckIds: ["x"],
    });
    expect(await db.rows(CLOSURES)).toEqual([
      expect.objectContaining({ check_id: "x", check_kind: "command", attempt_limit: 10 }),
      expect.objectContaining({ check_id: "x", check_kind: "quiz", attempt_limit: 3 }),
    ]);
  });

  it("I-out-4 closes a check at the next recompute when its limit is lowered to its failure count", async () => {
    const db = await seeded();
    await failures(db.db, KEY, 3, "a");
    const open = await recomputeLessonOutcome(db.db, target([commandCheck("a", { limit: 10 })]));

    const lowered = await recomputeLessonOutcome(db.db, target([commandCheck("a", { limit: 3 })]));

    expect(open.status).toBe("in-progress");
    expect(lowered).toEqual({ status: "not-passed", isChanged: true, closedCheckIds: ["a"] });
    expect(await db.rows(CLOSURES)).toEqual([
      expect.objectContaining({ check_id: "a", attempt_limit: 3, failed_count: 3 }),
    ]);
  });

  it("I-out-5 keeps a completed lesson completed and persists the closure of a check added later", async () => {
    const db = await seeded();
    await finishedAttempt(db.db, KEY, [{ checkId: "a", status: "passed" }]);
    await recomputeLessonOutcome(db.db, target([commandCheck("a")]));
    const completedAt = (await db.rows(PROGRESS))[0]?.completed_at;
    await failures(db.db, KEY, 2, "b");

    const write = await recomputeLessonOutcome(
      db.db,
      target([commandCheck("a"), commandCheck("b", { limit: 2 })]),
    );

    expect(write).toEqual({ status: "completed", isChanged: false, closedCheckIds: ["b"] });
    expect((await db.rows(PROGRESS))[0]).toMatchObject({
      status: "completed",
      completed_at: completedAt,
    });
    expect(await db.rows(CLOSURES)).toEqual([
      expect.objectContaining({ check_id: "b", check_kind: "command", attempt_limit: 2 }),
    ]);
  });

  it("I-out-5b moves a not-passed lesson back to in-progress when it gains an open counted check", async () => {
    const db = await seeded();
    await failures(db.db, KEY, 2, "a");
    const closed = await recomputeLessonOutcome(db.db, target([commandCheck("a", { limit: 2 })]));

    const reopened = await recomputeLessonOutcome(
      db.db,
      target([commandCheck("a", { limit: 2 }), commandCheck("b")]),
    );

    expect(closed.status).toBe("not-passed");
    expect(reopened).toEqual({ status: "in-progress", isChanged: true, closedCheckIds: [] });
    expect(await statusOf(db)).toBe("in-progress");
  });

  it("I-out-6 refuses a REPEATABLE READ transaction with OutcomeIsolationError", async () => {
    const db = await seeded();
    await finishedAttempt(db.db, KEY, [{ checkId: "a", status: "passed" }]);

    const call = db.db.transaction((tx) => applyLessonOutcome(tx, target([commandCheck("a")])), {
      isolationLevel: "repeatable read",
    });

    await expect(call).rejects.toBeInstanceOf(OutcomeIsolationError);
    expect(await statusOf(db)).toBe("in-progress");
  });

  it("I-out-7 waits for the progress row lock before it reads anything", async () => {
    const db = await seeded();
    const holder = createDb(db.url);
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let signalLocked: () => void = () => undefined;
    const locked = new Promise<void>((resolve) => {
      signalLocked = resolve;
    });
    const holding = holder.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT 1 FROM lesson_progress WHERE user_id = ${USER} FOR NO KEY UPDATE`,
      );
      signalLocked();
      await released;
    });
    try {
      await locked;

      const call = db.db.transaction(
        async (tx) => {
          await tx.execute(sql`SET LOCAL lock_timeout = '200ms'`);
          return applyLessonOutcome(tx, target([commandCheck("a")]));
        },
        { isolationLevel: "read committed" },
      );
      const error: unknown = await call.then(
        () => undefined,
        (reason: unknown) => reason,
      );

      expect(dbErrorCode(error)).toBe("55P03");
    } finally {
      release();
      await holding;
      await holder.close();
    }
  });

  // Pins only the check_results read, which moves with loadLessonFacts as a whole. A change that
  // reads only the attempts or the closures before the lock is not caught. Closures are written only
  // by this writer, under the same row lock and from the failed counts, so a closure committed while
  // it waited follows from results it reads after the lock anyway. The attempts read alone would need
  // a holder that also changes an attempt. The open #162 also changes facts.ts.
  it("I-out-7b reads the facts only after the progress row lock, so a result committed while it waited counts", async () => {
    const db = await seeded();
    const running = await insertAttempt(db.db, KEY, {
      status: "running",
      included: [{ checkId: "a", checkKind: "command" }],
    });
    const holder = createDb(db.url);
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let signalLocked: () => void = () => undefined;
    const locked = new Promise<void>((resolve) => {
      signalLocked = resolve;
    });
    // Stands in for a #34 transaction that has written a check result and holds the progress row lock
    // (ADR-0007 rule 7). Setting an attempt final is another such write; this test covers only the
    // result. #34 writes first and locks in applyLessonOutcome; the holder locks first only so the
    // test knows when the lock is held. The writer waits on the same state either way: lock held,
    // result not committed.
    const holding = holder.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT 1 FROM lesson_progress WHERE user_id = ${USER} FOR NO KEY UPDATE`,
      );
      await insertResult(tx, running, { checkId: "a", status: "passed" });
      signalLocked();
      await released;
    });
    let call: Promise<OutcomeWrite> | undefined;
    try {
      await locked;
      let reportPid: (pid: number) => void = () => undefined;
      const writerPid = new Promise<number>((resolve) => {
        reportPid = resolve;
      });

      call = db.db.transaction(
        async (tx) => {
          await tx.execute(sql`SET LOCAL lock_timeout = '10s'`);
          const { rows } = await tx.execute(sql`SELECT pg_backend_pid() AS pid`);
          const pid = rows[0]?.pid;
          if (typeof pid !== "number") {
            throw new Error(`pg_backend_pid() returned a ${typeof pid}, not a number`);
          }
          reportPid(pid);
          return applyLessonOutcome(tx, target([commandCheck("a")]));
        },
        { isolationLevel: "read committed" },
      );
      const pid = await Promise.race([
        writerPid,
        call.then(() => {
          throw new Error("the writer ended before it reported its backend pid");
        }),
      ]);
      await waitUntilBlocked(db, pid);
      release();
      await holding;
      const write = await call;

      expect(write).toEqual({ status: "completed", isChanged: true, closedCheckIds: [] });
      expect(await statusOf(db)).toBe("completed");
    } finally {
      release();
      await holding.catch(() => undefined);
      await call?.catch(() => undefined);
      await holder.close();
    }
  });

  it("I-out-8 never lets another user's results or closures change this user's outcome", async () => {
    const db = await seeded();
    const other: SeededLesson = { ...KEY, userId: "user_b" };
    await seedProgress(db.db, other);
    await finishedAttempt(db.db, other, [{ checkId: "a", status: "passed" }]);
    await failures(db.db, other, 2, "c");
    const checks = [commandCheck("a"), commandCheck("c", { limit: 2 })];
    await recomputeLessonOutcome(db.db, target(checks, "user_b"));

    const write = await recomputeLessonOutcome(db.db, target(checks));

    expect(write).toEqual({ status: "in-progress", isChanged: false, closedCheckIds: [] });
    expect((await db.rows(CLOSURES)).map((row) => row.user_id)).toEqual(["user_b"]);
  });

  it("I-out-9 throws LessonProgressMissingError for a lesson with no progress row", async () => {
    database = await testDatabase();

    const call = recomputeLessonOutcome(database.db, target([commandCheck("a")]));

    await expect(call).rejects.toBeInstanceOf(LessonProgressMissingError);
  });

  it("I-out-10 persists the closure at once when the failure that reaches the limit commits in a running attempt", async () => {
    const db = await seeded();
    const lesson = target([commandCheck("a", { limit: 3 })]);
    await failures(db.db, KEY, 2, "a");
    const running = await insertAttempt(db.db, KEY, {
      status: "running",
      included: [{ checkId: "a", checkKind: "command" }],
    });

    // The shape of #34's per-check commit (R34-3): the result row, then the writer, in one transaction.
    const write = await db.db.transaction(
      async (tx) => {
        await insertResult(tx, running, { checkId: "a", status: "failed" });
        return applyLessonOutcome(tx, lesson);
      },
      { isolationLevel: "read committed" },
    );

    expect(write).toEqual({ status: "not-passed", isChanged: true, closedCheckIds: ["a"] });
    expect(await db.rows(CLOSURES)).toEqual([
      expect.objectContaining({ check_id: "a", attempt_limit: 3, failed_count: 3 }),
    ]);
  });
});

// Bounds, not measurements: in the #148 research the whole file, this wait included, ran in
// about 3.3 s on a local Docker run.
// The writer's lock_timeout (10 s) is longer than the limit, so the writer never gives up while
// the poll is still waiting for it.
const LOCK_WAIT_LIMIT_MS = 5_000;
const LOCK_WAIT_POLL_MS = 20;

/** Polls pg_locks on a second pool client until the backend waits for a lock, or fails at the limit. */
async function waitUntilBlocked(db: TestDatabase, pid: number): Promise<void> {
  const deadline = Date.now() + LOCK_WAIT_LIMIT_MS;
  while (Date.now() < deadline) {
    const { rows } = await db.db.execute(
      sql`SELECT 1 FROM pg_locks WHERE pid = ${pid} AND NOT granted`,
    );
    if (rows.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, LOCK_WAIT_POLL_MS));
  }
  throw new Error(`backend ${pid} did not wait for a lock within ${LOCK_WAIT_LIMIT_MS} ms`);
}
