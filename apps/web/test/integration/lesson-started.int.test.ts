import { users } from "@academy/db";
import { afterEach, describe, expect, it } from "vitest";
import { readLessonStarted, recordLessonStarted } from "@/lib/progress/lesson-started";
import { type TestDatabase, testDatabase } from "./db";

// I-started (#32 design 3.4, 10.4): the first terminal input creates the enrollment and an in-progress
// lesson_progress row; nothing else ever changes because of it.

const COURSE = "agentic-dev";
const LESSON = "first-lesson";

let database: TestDatabase | undefined;

afterEach(async () => {
  await database?.drop();
  database = undefined;
});

async function withUsers(...ids: string[]): Promise<TestDatabase> {
  database = await testDatabase();
  await database.db
    .insert(users)
    .values(ids.map((id) => ({ id, name: id, email: `${id}@example.com` })));
  return database;
}

// Timestamps as text, so a second call that rewrote a row would show.
const PROGRESS = `SELECT user_id, course_id, lesson_id, status, started_at::text AS started_at,
  updated_at::text AS updated_at, completed_at::text AS completed_at
  FROM lesson_progress ORDER BY user_id, lesson_id`;
const ENROLLMENTS =
  "SELECT user_id, course_id, enrolled_at::text AS enrolled_at FROM enrollments ORDER BY user_id";

describe("I-started", () => {
  it("creates the enrollment and an in-progress row for the user's lesson", async () => {
    const db = await withUsers("user_a");

    await recordLessonStarted(db.db, { userId: "user_a", courseId: COURSE, lessonId: LESSON });

    expect(await db.rows(ENROLLMENTS)).toEqual([
      { user_id: "user_a", course_id: COURSE, enrolled_at: expect.any(String) },
    ]);
    expect(await db.rows(PROGRESS)).toEqual([
      expect.objectContaining({
        user_id: "user_a",
        course_id: COURSE,
        lesson_id: LESSON,
        status: "in-progress",
        completed_at: null,
      }),
    ]);
  });

  it("changes nothing on a second call", async () => {
    const db = await withUsers("user_a");
    const lesson = { userId: "user_a", courseId: COURSE, lessonId: LESSON };
    await recordLessonStarted(db.db, lesson);
    const enrollmentsBefore = await db.rows(ENROLLMENTS);
    const progressBefore = await db.rows(PROGRESS);

    await recordLessonStarted(db.db, lesson);

    expect(await db.rows(ENROLLMENTS)).toEqual(enrollmentsBefore);
    expect(await db.rows(PROGRESS)).toEqual(progressBefore);
  });

  it("leaves a completed lesson completed", async () => {
    const db = await withUsers("user_a");
    await db.rows(`INSERT INTO enrollments (user_id, course_id) VALUES ('user_a', '${COURSE}')`);
    await db.rows(
      `INSERT INTO lesson_progress (user_id, course_id, lesson_id, status, completed_at)
       VALUES ('user_a', '${COURSE}', '${LESSON}', 'completed', now())`,
    );
    const before = await db.rows(PROGRESS);

    await recordLessonStarted(db.db, { userId: "user_a", courseId: COURSE, lessonId: LESSON });

    expect(await db.rows(PROGRESS)).toEqual(before);
    expect(before[0]?.status).toBe("completed");
  });

  it("leaves another user's rows untouched", async () => {
    const db = await withUsers("user_a", "user_b");
    await recordLessonStarted(db.db, { userId: "user_b", courseId: COURSE, lessonId: LESSON });
    const before = await db.rows(PROGRESS);

    await recordLessonStarted(db.db, { userId: "user_a", courseId: COURSE, lessonId: LESSON });

    const after = await db.rows(PROGRESS);
    expect(after.filter((row) => row.user_id === "user_b")).toEqual(before);
    expect(after.map((row) => row.user_id)).toEqual(["user_a", "user_b"]);
  });
});

describe("I1 started read for the recreated note", () => {
  it("is false on a first visit with no row", async () => {
    const db = await withUsers("user_a");

    const isStarted = await readLessonStarted(db.db, {
      userId: "user_a",
      courseId: COURSE,
      lessonId: LESSON,
    });

    expect(isStarted).toBe(false);
  });

  it("is true for the recreated note after the lesson was recorded as started", async () => {
    const db = await withUsers("user_a");
    const lesson = { userId: "user_a", courseId: COURSE, lessonId: LESSON };
    await recordLessonStarted(db.db, lesson);

    const isStarted = await readLessonStarted(db.db, lesson);

    expect(isStarted).toBe(true);
  });

  it("is true for the recreated note when the lesson is completed", async () => {
    const db = await withUsers("user_a");
    await db.rows(`INSERT INTO enrollments (user_id, course_id) VALUES ('user_a', '${COURSE}')`);
    await db.rows(
      `INSERT INTO lesson_progress (user_id, course_id, lesson_id, status, completed_at)
       VALUES ('user_a', '${COURSE}', '${LESSON}', 'completed', now())`,
    );

    const isStarted = await readLessonStarted(db.db, {
      userId: "user_a",
      courseId: COURSE,
      lessonId: LESSON,
    });

    expect(isStarted).toBe(true);
  });

  it("is false on a first visit when only another user started the lesson", async () => {
    const db = await withUsers("user_a", "user_b");
    await recordLessonStarted(db.db, { userId: "user_b", courseId: COURSE, lessonId: LESSON });

    const isStarted = await readLessonStarted(db.db, {
      userId: "user_a",
      courseId: COURSE,
      lessonId: LESSON,
    });

    expect(isStarted).toBe(false);
  });

  it("is false on a first visit when the user started another lesson of the course", async () => {
    const db = await withUsers("user_a");
    await recordLessonStarted(db.db, {
      userId: "user_a",
      courseId: COURSE,
      lessonId: "other-lesson",
    });

    const isStarted = await readLessonStarted(db.db, {
      userId: "user_a",
      courseId: COURSE,
      lessonId: LESSON,
    });

    expect(isStarted).toBe(false);
  });

  it("is false on a first visit when the same lesson id was started under another course", async () => {
    const db = await withUsers("user_a");
    await recordLessonStarted(db.db, {
      userId: "user_a",
      courseId: "other-course",
      lessonId: LESSON,
    });

    const isStarted = await readLessonStarted(db.db, {
      userId: "user_a",
      courseId: COURSE,
      lessonId: LESSON,
    });

    expect(isStarted).toBe(false);
  });
});
