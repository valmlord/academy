import { type Database, enrollments, lessonProgress } from "@academy/db";
import { and, eq } from "drizzle-orm";

// The durable "lesson started" flag (#32 design 3.4, ADR-0007 item 5 as amended): the lesson_progress row
// itself. recordLessonStarted creates it, with its enrollment, on the learner's first terminal input (or a
// later one after a failed write, STARTED_RETRY_MS in machine.ts); both inserts do nothing on conflict, so a
// completed lesson stays completed. readLessonStarted is what the lesson environment reads as "started before"
// (ADR-0007 item 5 as amended by #150).

export interface StartedLesson {
  userId: string;
  courseId: string;
  lessonId: string;
}

export async function recordLessonStarted(db: Database, lesson: StartedLesson): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .insert(enrollments)
      .values({ userId: lesson.userId, courseId: lesson.courseId })
      .onConflictDoNothing();
    await tx
      .insert(lessonProgress)
      .values({
        userId: lesson.userId,
        courseId: lesson.courseId,
        lessonId: lesson.lessonId,
        status: "in-progress",
      })
      .onConflictDoNothing();
  });
}

/** True when the user's row for the lesson exists, whatever its status: the lesson environment's "started before" (F10 note). */
export async function readLessonStarted(db: Database, lesson: StartedLesson): Promise<boolean> {
  const rows = await db
    .select({ lessonId: lessonProgress.lessonId })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, lesson.userId),
        eq(lessonProgress.courseId, lesson.courseId),
        eq(lessonProgress.lessonId, lesson.lessonId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
