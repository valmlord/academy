import { firstReadableCourse } from "@/lib/course/courses";
import { nodeCourseFs } from "@/lib/course/node-fs";
import { type CourseReads, createCourseReads } from "@/lib/course/reads";
import type * as courseServer from "@/lib/course/server";
import { readLessonText } from "@/lib/course/text";
import { fixtureSource, recordingCourseFs } from "./course-fixture";

// `@/lib/course/server` for page tests: the same createCourseReads over a fixture root, with every file call
// recorded, minus server-only and React's per-request cache(). A test mocks the module with
// `vi.mock("@/lib/course/server", async () => (await import("@/test/course-server-fake")).courseServerFake)`
// and calls useCourseRoot before rendering.

/** A page read a course before the test named the root. */
export class NoCourseRootError extends Error {
  constructor() {
    super("call useCourseRoot before a page reads a course");
    this.name = "NoCourseRootError";
  }
}

interface Current {
  root: string;
  reads: CourseReads;
}

let current: Current | undefined;

/** Every file call since the last useCourseRoot, as `<method> "<rel>"`. */
export const fsCalls: string[] = [];

export function useCourseRoot(root: string): void {
  fsCalls.length = 0;
  const reads = createCourseReads({
    source: fixtureSource(root, recordingCourseFs(fsCalls).fs),
    logError: () => undefined,
  });
  current = { root, reads };
}

function now(): Current {
  if (current === undefined) throw new NoCourseRootError();
  return current;
}

export const courseServerFake: typeof courseServer = {
  getCourseById: (courseId) => now().reads.courseById(courseId),
  getCourseNames: () => now().reads.listNames(),
  getOtherCourses: (courseId) => now().reads.otherCourses(courseId),
  getFirstReadableCourse: () =>
    firstReadableCourse(
      () => now().reads.listNames(),
      (courseId) => now().reads.courseById(courseId),
    ),
  getLessonText: (lessonDir, kind) => readLessonText(nodeCourseFs, now().root, lessonDir, kind),
};
