import "server-only";
import { cache } from "react";
import { CourseReadError, LessonTextReadError } from "./errors";
import { nodeCourseFs } from "./node-fs";
import { type CourseTree, readCourse } from "./read";
import { courseRoot } from "./root";
import { type LessonTextKind, readLessonText } from "./text";

// Wiring only (ADR-0009 item 8): one read per request through React's cache(), nothing process-wide, so
// the retry button and pnpm dev see the files as they are now. Each failure is logged once per request with the
// relative file and the closed reason, then rethrown for the page's designed error state.

export const getCourse = cache(async (): Promise<CourseTree> => {
  try {
    return await readCourse(nodeCourseFs, courseRoot(process.env, process.cwd()));
  } catch (error) {
    if (error instanceof CourseReadError) {
      console.error(`web: course read failed: ${error.file}: ${error.reason}`);
    }
    throw error;
  }
});

export const getLessonText = cache(
  async (lessonDir: string, kind: LessonTextKind): Promise<string> => {
    try {
      return await readLessonText(
        nodeCourseFs,
        courseRoot(process.env, process.cwd()),
        lessonDir,
        kind,
      );
    } catch (error) {
      if (error instanceof LessonTextReadError) {
        console.error(`web: lesson text read failed: ${error.file}: ${error.reason}`);
      }
      throw error;
    }
  },
);
