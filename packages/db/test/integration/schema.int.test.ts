import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Database, type DbHandle } from "../../src/client.js";
import { migrateDatabase } from "../../src/migrate.js";
import {
  accounts,
  attempts,
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

/** The I6 fixture: one finished attempt with two check results and one mentor review. */
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

  it("I9 deleting a user removes its rows from all five child tables", async () => {
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
    ];
    expect(remaining.map((rows) => rows.length)).toEqual([0, 0, 0, 0, 0]);
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

  beforeAll(async () => {
    await seedProgress(userId);
    const { rows } = await raw.query(
      `INSERT INTO attempts (user_id, course_id, lesson_id) VALUES ($1, $2, $3) RETURNING id`,
      [userId, COURSE, LESSON],
    );
    const id: unknown = rows[0]?.id;
    if (typeof id !== "string") {
      throw new Error("insert into attempts returned no id");
    }
    attemptId = id;
  });

  function insertAttempt(status: string, finishedAt: Date | null, transcriptPath: string | null) {
    return raw.query(
      `INSERT INTO attempts (user_id, course_id, lesson_id, status, finished_at, transcript_path)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, COURSE, LESSON, status, finishedAt, transcriptPath],
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
