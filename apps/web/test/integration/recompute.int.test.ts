import { createDb } from "@academy/db";
import type { Check, Lesson } from "@academy/lesson-schema/schema";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { CourseReadError } from "@/lib/course/errors";
import type { CourseTree } from "@/lib/course/read";
import { recomputeLessonOutcome } from "@/lib/progress/outcome-writer";
import { recomputeOutcomesOnStartup } from "@/lib/progress/recompute";
import { commandCheck, lessonWith } from "@/test/progress-facts";
import { type TestDatabase, testDatabase } from "./db";
import {
  COURSE_ID,
  failures,
  finishedAttempt,
  type SeededLesson,
  seedProgress,
} from "./progress-seed";

// I-recompute (#101 design 6.5): the startup recompute over a course tree built in the test.

let database: TestDatabase | undefined;

afterEach(async () => {
  await database?.drop();
  database = undefined;
});

const USER = "user_a";
// A lock held longer than this bound means the recompute waited for it instead of timing out.
const LOCKED_CALL_BOUND_MS = 10_000;

function readyLesson(id: string, checks: Check[], status: Lesson["status"] = "ready"): Lesson {
  return { ...lessonWith(checks), id, status };
}

function tree(lessons: Lesson[]): CourseTree {
  return {
    id: COURSE_ID,
    title: "Course",
    description: "A course.",
    dir: "course",
    modules: [
      {
        dir: "00-module",
        number: "00",
        module: {
          id: "module",
          title: "Module",
          summary: "S.",
          outcomes: [],
          status: "ready",
          lessons: lessons.map((_, index) => `0${index + 1}-lesson`),
        },
        lessons: lessons.map((lesson, index) => ({
          dir: `00-module/0${index + 1}-lesson`,
          number: `0${index + 1}`,
          lesson,
        })),
      },
    ],
  };
}

function key(lessonId: string, userId = USER): SeededLesson {
  return { userId, courseId: COURSE_ID, lessonId };
}

interface Logs {
  info: string[];
  errors: string[];
}

async function recompute(db: TestDatabase, course: CourseTree): Promise<Logs> {
  const logs: Logs = { info: [], errors: [] };
  await recomputeOutcomesOnStartup({
    databaseUrl: db.url,
    readTree: async () => course,
    logInfo: (line) => logs.info.push(line),
    logError: (line) => logs.errors.push(line),
  });
  return logs;
}

const PROGRESS = `SELECT lesson_id, status, updated_at::text AS updated_at,
  completed_at::text AS completed_at FROM lesson_progress ORDER BY lesson_id`;
const CLOSURES = `SELECT lesson_id, check_id, check_kind, attempt_limit, failed_count,
  closed_at::text AS closed_at FROM check_closures ORDER BY lesson_id, check_id, check_kind`;

async function statusOf(db: TestDatabase, lessonId: string): Promise<unknown> {
  return (await db.rows(PROGRESS)).find((row) => row.lesson_id === lessonId)?.status;
}

describe("I-recompute recomputeOutcomesOnStartup", () => {
  it("(a) updates a not-passed row whose closed check was removed from the lesson", async () => {
    database = await testDatabase();
    const db = database;
    await seedProgress(db.db, key("l1"));
    await finishedAttempt(db.db, key("l1"), [{ checkId: "a", status: "passed" }]);
    await failures(db.db, key("l1"), 2, "b");
    await recomputeLessonOutcome(db.db, {
      userId: USER,
      courseId: COURSE_ID,
      lesson: readyLesson("l1", [commandCheck("a"), commandCheck("b", { limit: 2 })]),
    });
    const before = await statusOf(db, "l1");

    await recompute(db, tree([readyLesson("l1", [commandCheck("a")])]));

    expect(before).toBe("not-passed");
    expect(await statusOf(db, "l1")).toBe("completed");
  });

  it("(b) persists the closure of a completed lesson's later check at a lowered limit and keeps it after the limit is raised", async () => {
    database = await testDatabase();
    const db = database;
    await seedProgress(db.db, key("l1"), "completed");
    await failures(db.db, key("l1"), 5, "late");
    const withLimit = (limit: number): CourseTree =>
      tree([readyLesson("l1", [commandCheck("late", { limit })])]);

    await recompute(db, withLimit(5));
    const closures = await db.rows(CLOSURES);
    await recompute(db, withLimit(10));

    expect(closures).toEqual([
      expect.objectContaining({
        lesson_id: "l1",
        check_id: "late",
        check_kind: "command",
        attempt_limit: 5,
      }),
    ]);
    expect(await db.rows(CLOSURES)).toEqual(closures);
    expect(await statusOf(db, "l1")).toBe("completed");
  });

  it("(c) leaves rows of invisible lessons and of other courses untouched", async () => {
    database = await testDatabase();
    const db = database;
    await seedProgress(db.db, key("draft"));
    await seedProgress(db.db, key("gone"));
    await seedProgress(db.db, { userId: USER, courseId: "other-course", lessonId: "l1" });
    for (const lessonId of ["draft", "gone"]) {
      await finishedAttempt(db.db, key(lessonId), [{ checkId: "a", status: "passed" }]);
    }
    const before = await db.rows(PROGRESS);

    const logs = await recompute(
      db,
      tree([readyLesson("draft", [commandCheck("a")], "draft"), readyLesson("l1", [])]),
    );

    expect(await db.rows(PROGRESS)).toEqual(before);
    expect(logs.info).toEqual([expect.stringContaining("3 rows, 0 changed, 3 skipped, 0 failed")]);
  });

  it("(d) logs the summary line with the failed count and the elapsed time", async () => {
    database = await testDatabase();
    const db = database;
    await seedProgress(db.db, key("l1"));
    await seedProgress(db.db, key("l2"));
    await finishedAttempt(db.db, key("l1"), [{ checkId: "a", status: "passed" }]);

    const logs = await recompute(
      db,
      tree([readyLesson("l1", [commandCheck("a")]), readyLesson("l2", [commandCheck("a")])]),
    );

    expect(logs.errors).toEqual([]);
    expect(logs.info).toHaveLength(1);
    expect(logs.info[0]).toMatch(
      /^web: lesson outcomes recomputed: 2 rows, 1 changed, 0 skipped, 0 failed in \d+ ms$/,
    );
  });

  it("(e) skips a row whose lock another process holds, within the bound, and updates the other row", async () => {
    database = await testDatabase();
    const db = database;
    await seedProgress(db.db, key("l1"));
    await seedProgress(db.db, key("l2"));
    for (const lessonId of ["l1", "l2"]) {
      await finishedAttempt(db.db, key(lessonId), [{ checkId: "a", status: "passed" }]);
    }
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
      await tx.execute(sql`SELECT 1 FROM lesson_progress WHERE lesson_id = 'l1' FOR NO KEY UPDATE`);
      signalLocked();
      await released;
    });
    // Released only after the bound, so a recompute that waits for the lock cannot finish inside it.
    const releaseTimer = setTimeout(release, LOCKED_CALL_BOUND_MS + 1_000);
    try {
      await locked;
      const startedAt = performance.now();

      const logs = await recompute(
        db,
        tree([readyLesson("l1", [commandCheck("a")]), readyLesson("l2", [commandCheck("a")])]),
      );
      const elapsedMs = performance.now() - startedAt;

      expect(elapsedMs).toBeLessThan(LOCKED_CALL_BOUND_MS);
      expect(logs.errors).toEqual([
        `web: lesson outcome recompute failed for ${COURSE_ID}/l1: Error (55P03)`,
      ]);
      expect(logs.info[0]).toContain("2 rows, 1 changed, 0 skipped, 1 failed");
      release();
      await holding;
      expect(await statusOf(db, "l1")).toBe("in-progress");
      expect(await statusOf(db, "l2")).toBe("completed");
    } finally {
      clearTimeout(releaseTimer);
      release();
      await holding;
      await holder.close();
    }
  }, 30_000);

  it("logs the skip line and writes nothing when the course is unreadable", async () => {
    database = await testDatabase();
    const db = database;
    await seedProgress(db.db, key("l1"));
    await finishedAttempt(db.db, key("l1"), [{ checkId: "a", status: "passed" }]);
    const before = await db.rows(PROGRESS);
    const logs: Logs = { info: [], errors: [] };

    await recomputeOutcomesOnStartup({
      databaseUrl: db.url,
      readTree: async () => {
        throw new CourseReadError("course/course.yaml", "missing");
      },
      logInfo: (line) => logs.info.push(line),
      logError: (line) => logs.errors.push(line),
    });

    expect(logs).toEqual({
      info: [],
      errors: [
        "web: lesson outcome recompute skipped: course unreadable (course/course.yaml: missing)",
      ],
    });
    expect(await db.rows(PROGRESS)).toEqual(before);
  });
});
