import "server-only";
import { cache } from "react";
import {
  type CourseList,
  type CourseLookup,
  type CourseRead,
  firstReadableCourse,
  type OtherCourseList,
} from "./courses";
import { LessonTextReadError } from "./errors";
import { nodeCourseFs } from "./node-fs";
import { createCourseReads } from "./reads";
import { courseRoot } from "./root";
import { type LessonTextKind, readLessonText } from "./text";

// Wiring only (ADR-0009 item 8): each course at most once per request through React's cache(), keyed by the
// course id, nothing process-wide, so the retry button and pnpm dev see the files as they are now. The failure
// line is logged inside the cached read, so it too appears once per request and course.

const reads = createCourseReads({
  source: { fs: nodeCourseFs, root: () => courseRoot(process.env, process.cwd()) },
  logError: (line) => console.error(line),
});

export const getCourseById = cache(
  (courseId: unknown): Promise<CourseLookup> => reads.courseById(courseId),
);

export const getCourseNames = cache((): Promise<CourseList> => reads.listNames());

export const getOtherCourses = cache(
  (courseId: string): Promise<OtherCourseList> => reads.otherCourses(courseId),
);

// The one-course dashboard and top bar until #241.
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
