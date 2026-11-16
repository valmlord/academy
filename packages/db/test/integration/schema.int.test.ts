import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Database, type DbHandle } from "../../src/client.js";
import { migrateDatabase } from "../../src/migrate.js";
import {
  accounts,
  attempts,
  checkClosures,
  checkResults,
  enrollments,
  lessonProgress,
  mentorReviews,
  sessions,
  users,
} from "../../src/schema.js";
import {
  ATTEMPT_STATUSES,
  CHECK_KINDS,
  CHECK_RESULT_STATUSES,
  LESSON_PROGRESS_STATUSES,
  MENTOR_REVIEW_STATUSES,
} from "../../src/vocabulary.js";
import { type FreshDatabase, failureOf, freshDatabase, openClient } from "./helpers.js";

const COURSE = "ai-for-developers";
const LESSON = "intro-models-effort";

let fresh: FreshDatabase;
let handle: DbHandle;
let db: Database;
// Raw SQL for values the column types refuse at compile time (statuses outside the vocabulary).
let raw: pg.Client;

beforeAll(async () => {
  fresh = await freshDatabase();
  await migrateDatabase(fresh.url);
  handle = createDb(fresh.url);
  db = handle.db;
  raw = await openClient(fresh.url);
});

afterAll(async () => {
  await raw.end();
  await handle.close();
  await fresh.drop();
});

/** A user enrolled in COURSE with an in-progress LESSON: the rows every attempt needs first. */
async function seedProgress(userId: string, lessonId = LESSON): Promise<void> {
  await db
    .insert(users)
    .values({ id: userId, name: "Learner", email: `${userId}@example.invalid` });
  await db.insert(enrollments).values({ userId, courseId: COURSE });
  await db.insert(lessonProgress).values({ userId, courseId: COURSE, lessonId });
}

interface SeededAttempt {
  attemptId: string;
  transcriptPath: string;
}

/** The I6 fixture: one finished attempt with two check results, one mentor review and a closure. */
async function seedAttempt(userId: string): Promise<SeededAttempt> {
  await seedProgress(userId);
  const transcriptPath = `${randomUUID()}/agent.jsonl`;
  const [attempt] = await db
    .insert(attempts)
    .values({
      userId,
      courseId: COURSE,
      lessonId: LESSON,
      status: "failed",
      transcriptPath,
      finishedAt: new Date(),
    })
    .returning({ id: attempts.id });
  if (attempt === undefined) {
    throw new Error("insert into attempts returned no row");
  }
  await db.insert(checkResults).values([
    {
      attemptId: attempt.id,
      checkId: "models-effort-quiz",
      checkKind: "quiz",
      status: "passed",
      score: 0.75,
    },
    {
      attemptId: attempt.id,
      checkId: "model-routing",
      checkKind: "command",
      status: "timeout",
      details: { outputTail: "still running", exitCode: null, lines: [1, 2] },
      durationMs: 1_800_000,
      costUsd: "0.012345",
    },
  ]);
  await db.insert(mentorReviews).values({
    attemptId: attempt.id,
    checkId: "model-routing",
    status: "completed",
    body: "What did the timeout tell you?",
    costUsd: "0.5",
    completedAt: new Date(),
  });
  await db.insert(checkClosures).values({
    userId,
    courseId: COURSE,
    lessonId: LESSON,
    checkId: "model-routing",
    checkKind: "command",
    attemptLimit: 1,
    failedCount: 1,
  });
  return { attemptId: attempt.id, transcriptPath };
}

describe("schema", () => {
  it("I6 round-trips an attempt with its check results", async () => {
    const { attemptId, transcriptPath } = await seedAttempt("u-i6");

    const [attempt] = await db.select().from(attempts).where(eq(attempts.id, attemptId));
    const results = await db
      .select()
      .from(checkResults)
      .where(eq(checkResults.attemptId, attemptId))
      .orderBy(checkResults.checkId);

    expect(attempt).toMatchObject({
      courseId: COURSE,
      lessonId: LESSON,
      status: "failed",
      transcriptPath,
    });
    expect(results).toMatchObject([
      {
        checkId: "model-routing",
        checkKind: "command",
        status: "timeout",
        score: null,
        details: { outputTail: "still running", exitCode: null, lines: [1, 2] },
        durationMs: 1_800_000,
        costUsd: "0.012345",
      },
      { checkId: "models-effort-quiz", checkKind: "quiz", status: "passed", score: 0.75 },
    ]);
  });

  it("I7 keeps progress unique per user and lesson, but not across courses", async () => {
    await seedProgress("u-i7");
    const duplicate = db
      .insert(lessonProgress)
      .values({ userId: "u-i7", courseId: COURSE, lessonId: LESSON });

    expect(await failureOf(duplicate)).toEqual({
      code: "23505",
      constraint: "lesson_progress_pkey",
    });

    await db.insert(enrollments).values({ userId: "u-i7", courseId: "second-course" });
    await expect(
      db
        .insert(lessonProgress)
        .values({ userId: "u-i7", courseId: "second-course", lessonId: LESSON }),
    ).resolves.toBeDefined();
  });

  it("I9 deleting a user removes its rows from all six child tables", async () => {
    const { attemptId } = await seedAttempt("u-i9");

    await db.delete(users).where(eq(users.id, "u-i9"));

    const remaining = [
      await db.select().from(enrollments).where(eq(enrollments.userId, "u-i9")),
      await db.select().from(lessonProgress).where(eq(lessonProgress.userId, "u-i9")),
      await db.select().from(attempts).where(eq(attempts.userId, "u-i9")),
      await db
        .select()
        .from(checkResults)
        .where(inArray(checkResults.attemptId, [attemptId])),
      await db.select().from(mentorReviews).where(eq(mentorReviews.attemptId, attemptId)),
      await db.select().from(checkClosures).where(eq(checkClosures.userId, "u-i9")),
    ];
    expect(remaining.map((rows) => rows.length)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("I10 refuses an attempt for a lesson without a progress row", async () => {
    await seedProgress("u-i10");

    const orphan = db
      .insert(attempts)
      .values({ userId: "u-i10", courseId: COURSE, lessonId: "never-opened" });

    expect(await failureOf(orphan)).toEqual({
      code: "23503",
      constraint: "attempts_lesson_progress_fk",
    });
  });
});

describe("I11 row constraints", () => {
  const userId = "u-i11";
  let attemptId: string;

  // Finished, so no case below shares a lesson with a running attempt (attempts_one_running_idx); it
  // only carries the check-result and mentor-review cases, which do not depend on its status.
  beforeAll(async () => {
    await seedProgress(userId);
    const { rows } = await raw.query(
      `INSERT INTO attempts (user_id, course_id, lesson_id, status, finished_at)
       VALUES ($1, $2, $3, 'failed', now()) RETURNING id`,
      [userId, COURSE, LESSON],
    );
    const id: unknown = rows[0]?.id;
    if (typeof id !== "string") {
      throw new Error("insert into attempts returned no id");
    }
    attemptId = id;
  });

  /**
   * Each attempt gets a lesson of its own, so the running ones never meet attempts_one_running_idx
   * and every rejection below comes from the CHECK it names.
   */
  async function insertAttempt(
    status: string,
    finishedAt: Date | null,
    transcriptPath: string | null,
  ): Promise<pg.QueryResult> {
    const lessonId = `i11-${randomUUID()}`;
    await raw.query(
      "INSERT INTO lesson_progress (user_id, course_id, lesson_id) VALUES ($1, $2, $3)",
      [userId, COURSE, lessonId],
    );
    return raw.query(
      `INSERT INTO attempts (user_id, course_id, lesson_id, status, finished_at, transcript_path)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, COURSE, lessonId, status, finishedAt, transcriptPath],
    );
  }

  function insertCheckResult(checkId: string, kind: string, status: string, score: number | null) {
    return raw.query(
      `INSERT INTO check_results (attempt_id, check_id, check_kind, status, score)
       VALUES ($1, $2, $3, $4, $5)`,
      [attemptId, checkId, kind, status, score],
    );
  }

  function insertProgress(lessonId: string, status: string, completedAt: Date | null) {
    return raw.query(
      `INSERT INTO lesson_progress (user_id, course_id, lesson_id, status, completed_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, COURSE, lessonId, status, completedAt],
    );
  }

  it("I11 rejects an attempt status outside the vocabulary", async () => {
    expect(await failureOf(insertAttempt("done", new Date(), null))).toEqual({
      code: "23514",
      constraint: "attempts_status_check",
    });
  });

  it("I11 rejects a check kind outside the lesson contract", async () => {
    expect(await failureOf(insertCheckResult("essay-check", "essay", "passed", null))).toEqual({
      code: "23514",
      constraint: "check_results_check_kind_check",
    });
  });

  it("I11 rejects an empty user id", async () => {
    const insert = raw.query(
      "INSERT INTO users (id, name, email) VALUES ('', 'x', 'empty@x.invalid')",
    );

    expect(await failureOf(insert)).toEqual({ code: "23514", constraint: "users_id_check" });
  });

  it("I11 rejects a running attempt with finished_at", async () => {
    expect(await failureOf(insertAttempt("running", new Date(), null))).toEqual({
      code: "23514",
      constraint: "attempts_finished_check",
    });
  });

  it("I11 rejects completed progress without completed_at", async () => {
    expect(await failureOf(insertProgress("completed-no-date", "completed", null))).toEqual({
      code: "23514",
      constraint: "lesson_progress_completed_check",
    });
  });

  it("I11 rejects a score above 1", async () => {
    expect(await failureOf(insertCheckResult("high-score", "quiz", "passed", 1.5))).toEqual({
      code: "23514",
      constraint: "check_results_score_check",
    });
  });

  it("I11 accepts every lesson progress status", async () => {
    for (const status of LESSON_PROGRESS_STATUSES) {
      const completedAt = status === "completed" ? new Date() : null;
      await expect(insertProgress(`vocab-${status}`, status, completedAt)).resolves.toBeDefined();
    }
  });

  it("I11 accepts every attempt status", async () => {
    for (const status of ATTEMPT_STATUSES) {
      const finishedAt = status === "running" ? null : new Date();
      await expect(insertAttempt(status, finishedAt, null)).resolves.toBeDefined();
    }
  });

  it("I11 accepts every check result status", async () => {
    for (const status of CHECK_RESULT_STATUSES) {
      await expect(
        insertCheckResult(`status-${status}`, "quiz", status, null),
      ).resolves.toBeDefined();
    }
  });

  it("I11 accepts every check kind of the lesson contract", async () => {
    for (const kind of CHECK_KINDS) {
      await expect(insertCheckResult(`kind-${kind}`, kind, "passed", null)).resolves.toBeDefined();
    }
  });

  it("I11 accepts every mentor review status", async () => {
    for (const status of MENTOR_REVIEW_STATUSES) {
      const insert = raw.query(
        "INSERT INTO mentor_reviews (attempt_id, status, completed_at) VALUES ($1, $2, $3)",
        [attemptId, status, status === "pending" ? null : new Date()],
      );
      await expect(insert).resolves.toBeDefined();
    }
  });

  // Titles are concatenated, never printf-formatted, so the % in %2e%2e/x stays literal.
  const rejectedPaths: [label: string, value: string][] = [
    ["<empty>", ""],
    [".", "."],
    ["..", ".."],
    ["../a", "../a"],
    ["a/..", "a/.."],
    ["a/../b", "a/../b"],
    ["/abs", "/abs"],
    ["a//b", "a//b"],
    ["a\\b", "a\\b"],
    ["a<LF>b", "a\nb"],
    ["%2e%2e/x", "%2e%2e/x"],
  ];
  for (const [label, value] of rejectedPaths) {
    it("I11 transcript_path rejects " + label, async () => {
      expect(await failureOf(insertAttempt("running", null, value))).toEqual({
        code: "23514",
        constraint: "attempts_transcript_path_check",
      });
    });
  }

  const acceptedPaths: [label: string, value: string | null][] = [
    ["<uuid>/", `${randomUUID()}/`],
    ["<uuid>/agent.jsonl", `${randomUUID()}/agent.jsonl`],
    ["a..b", "a..b"],
    ["<null>", null],
  ];
  for (const [label, value] of acceptedPaths) {
    it("I11 transcript_path accepts " + label, async () => {
      await expect(insertAttempt("running", null, value)).resolves.toBeDefined();
    });
  }
});

describe("Better Auth tables (#29)", () => {
  async function seedAuthUser(userId: string): Promise<void> {
    await db
      .insert(users)
      .values({ id: userId, name: "Learner", email: `${userId}@example.invalid` });
    await db.insert(sessions).values({
      id: `${userId}-s`,
      token: `${userId}-token`,
      userId,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await db.insert(accounts).values({
      id: `${userId}-a`,
      accountId: userId,
      providerId: "credential",
      userId,
      password: "not-a-real-hash",
    });
  }

  it("I-db-1 deleting a user removes its sessions and accounts", async () => {
    await seedAuthUser("u-db1");

    await db.delete(users).where(eq(users.id, "u-db1"));

    const remaining = [
      await db.select().from(sessions).where(eq(sessions.userId, "u-db1")),
      await db.select().from(accounts).where(eq(accounts.userId, "u-db1")),
    ];
    expect(remaining.map((rows) => rows.length)).toEqual([0, 0]);
  });

  it("I-db-2 names every constraint and index of the auth tables", async () => {
    const { rows: constraints } = await raw.query(
      `SELECT conname FROM pg_constraint
       WHERE conrelid::regclass::text IN ('sessions', 'accounts', 'verifications')
       ORDER BY conname`,
    );
    const { rows: indexes } = await raw.query(
      `SELECT indexname FROM pg_indexes
       WHERE tablename IN ('sessions', 'accounts', 'verifications')
       ORDER BY indexname`,
    );

    expect(constraints.map((row) => row.conname)).toEqual([
      "accounts_pkey",
      "accounts_provider_account_unique",
      "accounts_user_id_fk",
      "sessions_pkey",
      "sessions_token_unique",
      "sessions_user_id_fk",
      "verifications_pkey",
    ]);
    expect(indexes.map((row) => row.indexname)).toEqual([
      "accounts_pkey",
      "accounts_provider_account_unique",
      "accounts_user_id_idx",
      "sessions_pkey",
      "sessions_token_unique",
      "sessions_user_id_idx",
      "verifications_identifier_idx",
      "verifications_pkey",
    ]);
  });

  it("I-db-3 refuses a duplicate session token and a duplicate provider account", async () => {
    await seedAuthUser("u-db3");

    const duplicateToken = db.insert(sessions).values({
      id: "u-db3-s2",
      token: "u-db3-token",
      userId: "u-db3",
      expiresAt: new Date(Date.now() + 60_000),
    });
    const duplicateAccount = db.insert(accounts).values({
      id: "u-db3-a2",
      accountId: "u-db3",
      providerId: "credential",
      userId: "u-db3",
    });

    expect(await failureOf(duplicateToken)).toEqual({
      code: "23505",
      constraint: "sessions_token_unique",
    });
    expect(await failureOf(duplicateAccount)).toEqual({
      code: "23505",
      constraint: "accounts_provider_account_unique",
    });
  });
});

/** Inserts an attempt through the raw client and returns its id. */
async function insertRawAttempt(
  userId: string,
  lessonId: string,
  status: string,
  executor: pg.Client = raw,
): Promise<string> {
  const finishedAt = status === "running" ? null : new Date();
  const { rows } = await executor.query(
    `INSERT INTO attempts (user_id, course_id, lesson_id, status, finished_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [userId, COURSE, lessonId, status, finishedAt],
  );
  const id: unknown = rows[0]?.id;
  if (typeof id !== "string") {
    throw new Error("insert into attempts returned no id");
  }
  return id;
}

const ONE_RUNNING = { code: "23505", constraint: "attempts_one_running_idx" };
const LOCK_WAIT_POLL_MS = 50;
const LOCK_WAIT_LIMIT_MS = 10_000;

/** Waits until the backend `pid` is blocked on a lock it has not been granted. */
async function waitUntilBlocked(pid: number): Promise<void> {
  const deadline = Date.now() + LOCK_WAIT_LIMIT_MS;
  while (Date.now() < deadline) {
    const { rows } = await raw.query("SELECT 1 FROM pg_locks WHERE pid = $1 AND NOT granted", [
      pid,
    ]);
    if (rows.length > 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, LOCK_WAIT_POLL_MS));
  }
  throw new Error(`backend ${pid} never waited for a lock`);
}

describe("I12 one running attempt per lesson", () => {
  it("I12 rejects a second running attempt of the same lesson", async () => {
    await seedProgress("u-i12a");
    await insertRawAttempt("u-i12a", LESSON, "running");

    expect(await failureOf(insertRawAttempt("u-i12a", LESSON, "running"))).toEqual(ONE_RUNNING);
  });

  it("I12 accepts a running attempt next to a finished one of the same lesson", async () => {
    await seedProgress("u-i12b");
    await insertRawAttempt("u-i12b", LESSON, "failed");

    await expect(insertRawAttempt("u-i12b", LESSON, "running")).resolves.toBeTypeOf("string");
  });

  it("I12 accepts running attempts of two lessons of one learner", async () => {
    await seedProgress("u-i12c");
    await db
      .insert(lessonProgress)
      .values({ userId: "u-i12c", courseId: COURSE, lessonId: "other" });
    await insertRawAttempt("u-i12c", LESSON, "running");

    await expect(insertRawAttempt("u-i12c", "other", "running")).resolves.toBeTypeOf("string");
  });

  it("I12b lets one of two concurrent starts commit and rejects the other", async () => {
    await seedProgress("u-i12d");
    const first = await openClient(fresh.url);
    const second = await openClient(fresh.url);
    try {
      await first.query("BEGIN");
      await insertRawAttempt("u-i12d", LESSON, "running", first);
      await second.query("BEGIN");
      const { rows } = await second.query("SELECT pg_backend_pid() AS pid");
      const secondInsert = failureOf(insertRawAttempt("u-i12d", LESSON, "running", second));
      await waitUntilBlocked(Number(rows[0]?.pid));

      await first.query("COMMIT");

      expect(await secondInsert).toEqual(ONE_RUNNING);
      await second.query("ROLLBACK");
      const running = await raw.query(
        "SELECT count(*)::int AS n FROM attempts WHERE user_id = $1 AND status = 'running'",
        ["u-i12d"],
      );
      expect(running.rows[0]?.n).toBe(1);
    } finally {
      await first.end();
      await second.end();
    }
  });
});

describe("I13 result and attempt facts", () => {
  const userId = "u-i13";
  let attemptId: string;

  beforeAll(async () => {
    await seedProgress(userId);
    attemptId = await insertRawAttempt(userId, LESSON, "failed");
  });

  interface ResultFacts {
    kind: string;
    status: string;
    isFormatError?: boolean;
    isBudgetExhausted?: boolean;
    message?: string | null;
    rawError?: string | null;
  }

  function insertResult(facts: ResultFacts): Promise<pg.QueryResult> {
    return raw.query(
      `INSERT INTO check_results
         (attempt_id, check_id, check_kind, status, is_format_error, is_budget_exhausted, message, raw_error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        attemptId,
        `i13-${randomUUID()}`,
        facts.kind,
        facts.status,
        facts.isFormatError ?? false,
        facts.isBudgetExhausted ?? false,
        facts.message ?? null,
        facts.rawError ?? null,
      ],
    );
  }

  function insertIncluded(ids: string[], kinds: string[]): Promise<pg.QueryResult> {
    return raw.query(
      `INSERT INTO attempts
         (user_id, course_id, lesson_id, status, finished_at, included_check_ids, included_check_kinds)
       VALUES ($1, $2, $3, 'failed', now(), $4, $5)`,
      [userId, COURSE, LESSON, ids, kinds],
    );
  }

  const rejected: [label: string, facts: ResultFacts, constraint: string][] = [
    [
      "a format error with status timeout",
      { kind: "command", status: "timeout", isFormatError: true },
      "check_results_format_error_check",
    ],
    [
      "a budget flag on a command result",
      { kind: "command", status: "failed", isBudgetExhausted: true },
      "check_results_budget_check",
    ],
    [
      "both flags on one result",
      { kind: "hidden-task", status: "failed", isFormatError: true, isBudgetExhausted: true },
      "check_results_flags_check",
    ],
    [
      "raw_error on a failed result",
      { kind: "command", status: "failed", rawError: "pre-start: exec-start" },
      "check_results_raw_error_check",
    ],
  ];
  for (const [label, facts, constraint] of rejected) {
    it(`I13 rejects ${label}`, async () => {
      expect(await failureOf(insertResult(facts))).toEqual({ code: "23514", constraint });
    });
  }

  it("I13 accepts a format error with status failed", async () => {
    await expect(
      insertResult({ kind: "command", status: "failed", isFormatError: true }),
    ).resolves.toBeDefined();
  });

  it("I13 accepts an exhausted budget on a failed hidden-task result", async () => {
    await expect(
      insertResult({ kind: "hidden-task", status: "failed", isBudgetExhausted: true }),
    ).resolves.toBeDefined();
  });

  it("I13 accepts raw_error on an error result", async () => {
    await expect(
      insertResult({ kind: "command", status: "error", rawError: "platform-stop: web-restart" }),
    ).resolves.toBeDefined();
  });

  it("I13 accepts a message on every check result status", async () => {
    for (const status of CHECK_RESULT_STATUSES) {
      await expect(
        insertResult({ kind: "command", status, message: "grader says hello" }),
      ).resolves.toBeDefined();
    }
  });

  it("I13 rejects included check ids and kinds of different lengths", async () => {
    expect(await failureOf(insertIncluded(["a", "b"], ["command"]))).toEqual({
      code: "23514",
      constraint: "attempts_included_checks_check",
    });
  });

  it("I13 rejects an included kind outside the lesson contract", async () => {
    expect(await failureOf(insertIncluded(["a"], ["essay"]))).toEqual({
      code: "23514",
      constraint: "attempts_included_check_kinds_check",
    });
  });

  it("I13 accepts included check ids with a kind for each", async () => {
    await expect(insertIncluded(["a", "b"], ["command", "quiz"])).resolves.toBeDefined();
  });
});

describe("I14 check closures", () => {
  const userId = "u-i14";

  beforeAll(async () => {
    await seedProgress(userId);
  });

  function insertClosure(
    checkId: string,
    kind: string,
    attemptLimit: number,
    failedCount: number,
    lessonId = LESSON,
  ): Promise<pg.QueryResult> {
    return raw.query(
      `INSERT INTO check_closures
         (user_id, course_id, lesson_id, check_id, check_kind, attempt_limit, failed_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, COURSE, lessonId, checkId, kind, attemptLimit, failedCount],
    );
  }

  it("I14 rejects a second closure of the same check id and kind", async () => {
    await insertClosure("dup", "command", 10, 10);

    expect(await failureOf(insertClosure("dup", "command", 10, 11))).toEqual({
      code: "23505",
      constraint: "check_closures_pkey",
    });
  });

  it("I14 accepts a closure of the same check id under another kind", async () => {
    await insertClosure("changed", "command", 10, 10);

    await expect(insertClosure("changed", "quiz", 3, 3)).resolves.toBeDefined();
  });

  it("I14 rejects a closure for a lesson without a progress row", async () => {
    expect(await failureOf(insertClosure("orphan", "command", 1, 1, "never-opened"))).toEqual({
      code: "23503",
      constraint: "check_closures_lesson_progress_fk",
    });
  });

  it("I14 rejects a closure whose failed count is below its limit", async () => {
    expect(await failureOf(insertClosure("early", "command", 10, 9))).toEqual({
      code: "23514",
      constraint: "check_closures_count_check",
    });
  });

  it("I14 rejects a closure of a kind outside the lesson contract", async () => {
    expect(await failureOf(insertClosure("essay", "essay", 1, 1))).toEqual({
      code: "23514",
      constraint: "check_closures_check_kind_check",
    });
  });
});

describe("I15 included check arrays (#162)", () => {
  const userId = "u-i15";

  beforeAll(async () => {
    await seedProgress(userId);
  });

  // SQL array literals rather than JS arrays, so the test shows exactly the value Postgres receives.
  function insertIncludedLiteral(ids: string, kinds: string): Promise<pg.QueryResult> {
    return raw.query(
      `INSERT INTO attempts
         (user_id, course_id, lesson_id, status, finished_at, included_check_ids, included_check_kinds)
       VALUES ($1, $2, $3, 'failed', now(), $4::text[], $5::text[])`,
      [userId, COURSE, LESSON, ids, kinds],
    );
  }

  // Each value violates only the named constraint, so the name does not depend on firing order.
  const rejected: [name: string, ids: string, kinds: string, constraint: string][] = [
    [
      "I15 rejects two-dimensional check ids with 23514, not 0A000",
      "{{a},{b}}",
      "{command,quiz}",
      "attempts_included_check_ids_dims_check",
    ],
    [
      "I15 rejects a NULL check id",
      "{a,NULL}",
      "{command,quiz}",
      "attempts_included_check_ids_nulls_check",
    ],
    [
      "I15 rejects an empty check id",
      '{a,""}',
      "{command,quiz}",
      "attempts_included_check_ids_empty_check",
    ],
    [
      "I15 rejects two-dimensional check kinds",
      "{a,b}",
      "{{command},{quiz}}",
      "attempts_included_check_kinds_dims_check",
    ],
    [
      "I15 rejects a two-dimensional check id array that also holds a NULL",
      "{{a},{NULL}}",
      "{command,quiz}",
      "attempts_included_check_ids_dims_check",
    ],
    [
      "I15 rejects a NULL check kind through the kind list check",
      "{a,b}",
      "{command,NULL}",
      "attempts_included_check_kinds_check",
    ],
    [
      "I15 rejects an empty check kind through the kind list check",
      "{a,b}",
      '{command,""}',
      "attempts_included_check_kinds_check",
    ],
  ];
  for (const [name, ids, kinds, constraint] of rejected) {
    it(name, async () => {
      expect(await failureOf(insertIncludedLiteral(ids, kinds))).toEqual({
        code: "23514",
        constraint,
      });
    });
  }

  // With the dimension check out of the way, only the CASE stands between array_position and a
  // 2-D value; alphabetical firing order hides its absence from every other test.
  it("I15 the NULL check never raises on a two-dimensional array, whatever order the checks run in", async () => {
    await raw.query("BEGIN");
    try {
      await raw.query(
        "ALTER TABLE attempts DROP CONSTRAINT attempts_included_check_ids_dims_check",
      );

      const inserted = await insertIncludedLiteral("{{a},{b}}", "{command,quiz}");

      expect(inserted.rowCount).toBe(1);
    } finally {
      await raw.query("ROLLBACK");
    }
  });

  const accepted: [name: string, ids: string, kinds: string][] = [
    ["I15 accepts empty included arrays", "{}", "{}"],
    ["I15 accepts one-dimensional ids with a kind for each", "{a,b}", "{command,quiz}"],
    // No code indexes these arrays in SQL, and node-pg returns the elements only.
    ["I15 accepts an array whose lower bound is not 1", "[0:1]={a,b}", "{command,quiz}"],
  ];
  for (const [name, ids, kinds] of accepted) {
    it(name, async () => {
      await expect(insertIncludedLiteral(ids, kinds)).resolves.toBeDefined();
    });
  }
});

const CONSTRAINTS_OF_101 = [
  "attempts_included_check_kinds_check",
  "attempts_included_checks_check",
  "check_closures_check_id_check",
  "check_closures_check_kind_check",
  "check_closures_count_check",
  "check_closures_lesson_progress_fk",
  "check_closures_pkey",
  "check_results_budget_check",
  "check_results_flags_check",
  "check_results_format_error_check",
  "check_results_raw_error_check",
];

describe("constraint names of #101", () => {
  it("names every new constraint and the running-attempt index with its predicate", async () => {
    const { rows: constraints } = await raw.query(
      "SELECT conname FROM pg_constraint WHERE conname = ANY($1::text[]) ORDER BY conname",
      [CONSTRAINTS_OF_101],
    );
    const { rows: indexes } = await raw.query(
      "SELECT indexdef FROM pg_indexes WHERE indexname = 'attempts_one_running_idx'",
    );

    expect(constraints.map((row) => row.conname)).toEqual(CONSTRAINTS_OF_101);
    expect(indexes).toHaveLength(1);
    expect(indexes[0]?.indexdef).toContain("CREATE UNIQUE INDEX attempts_one_running_idx");
    expect(indexes[0]?.indexdef).toContain("WHERE (status = 'running'::text)");
  });
});

const CONSTRAINTS_OF_162 = [
  "attempts_included_check_ids_dims_check",
  "attempts_included_check_ids_empty_check",
  "attempts_included_check_ids_nulls_check",
  "attempts_included_check_kinds_dims_check",
];

describe("constraint names of #162", () => {
  it("names every #162 constraint", async () => {
    const { rows } = await raw.query(
      "SELECT conname FROM pg_constraint WHERE conname = ANY($1::text[]) ORDER BY conname",
      [CONSTRAINTS_OF_162],
    );

    expect(rows.map((row) => row.conname)).toEqual(CONSTRAINTS_OF_162);
  });
});
