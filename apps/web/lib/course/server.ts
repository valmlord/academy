import "server-only";
import { cache } from "react";
import {
  type CourseList,
  type CourseLookup,
  type CourseRead,
  type EveryCourse,
  firstReadableCourse,
  type OtherCourseList,
} from "./courses";
import { LessonTextReadError } from "./errors";
import { nodeCourseFs } from "./node-fs";
import { createCourseReads } from "./reads";
import { courseRoot } from "./root";
import { type LessonTextKind, readLessonText } from "./text";

// Wiring only (ADR-0009 item 8): every getter is wrapped in React's cache(), so a repeated call with the same
// arguments in one request reads nothing again, and nothing is kept across requests, so the retry button and
// pnpm dev see the files as they are now. Failure lines are logged inside the cached reads.

const reads = createCourseReads({
  source: { fs: nodeCourseFs, root: () => courseRoot(process.env, process.cwd()) },
  logError: (line) => console.error(line),
});

export const getCourseById = cache(
  (courseId: unknown): Promise<CourseLookup> => reads.courseById(courseId),
);

export const getCourseNames = cache((): Promise<CourseList> => reads.listNames());

// One listing and one read per listed course; cache() makes it once per request.
export const getEveryCourse = cache((): Promise<EveryCourse> => reads.everyCourse());

export const getOtherCourses = cache(
  (courseId: string): Promise<OtherCourseList> => reads.otherCourses(courseId),
);

// The one-course dashboard until #247.
export const getFirstReadableCourse = cache(
  (): Promise<CourseRead> => firstReadableCourse(getCourseNames, getCourseById),
);

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
