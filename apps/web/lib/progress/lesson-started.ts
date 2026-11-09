import { type Database, enrollments, lessonProgress } from "@academy/db";

// The one writer of the durable "lesson started" flag (#32 design 3.4, ADR-0007 item 5 as amended): the
// lesson_progress row itself, created with its enrollment on the learner's first terminal input. Both inserts
// do nothing on conflict, so a completed lesson stays completed and nothing is ever cleared.

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
