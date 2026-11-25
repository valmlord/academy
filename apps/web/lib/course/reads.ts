import {
  type CourseList,
  type CourseLookup,
  type CourseSource,
  type EveryCourse,
  listCourseNames,
  type OtherCourseList,
  readCourseById,
  readEveryCourse,
  readOtherCourses,
} from "./courses";
import { type CourseReadError, type CourseRootReadError, describeCourseFailure } from "./errors";

// The request-side reads with their operator line, outside the server-only wiring so a test can pin the line.
// A `not-found` logs nothing: its id came from a browser and names no course.

export interface CourseReads {
  /** Logs a course failure or a root failure as `web: course read failed: ...`. */
  courseById(courseId: unknown): Promise<CourseLookup>;
  /** Logs a root failure as `web: course read failed: root: ...`. */
  listNames(): Promise<CourseList>;
  /** Logs the root failure, or one line per failing course. */
  everyCourse(): Promise<EveryCourse>;
  /**
   * Logs a root failure as `listNames` does, and no line for a failing other course: its entry carries only
   * its id and no title, none of its error.
   */
  otherCourses(courseId: string): Promise<OtherCourseList>;
}

export function createCourseReads(deps: {
  source: CourseSource;
  logError: (line: string) => void;
}): CourseReads {
  function logFailure(error: CourseReadError | CourseRootReadError): void {
    deps.logError(`web: course read failed: ${describeCourseFailure(error)}`);
  }
  return {
    async courseById(courseId) {
      const lookup = await readCourseById(deps.source, courseId);
      if (lookup.kind === "course-failure" || lookup.kind === "root-failure") {
        logFailure(lookup.error);
      }
      return lookup;
    },
    async listNames() {
      const list = await listCourseNames(deps.source);
      if (list.kind === "root-failure") logFailure(list.error);
      return list;
    },
    async everyCourse() {
      const every = await readEveryCourse(deps.source);
      if (every.kind === "root-failure") {
        logFailure(every.error);
      } else {
        for (const read of every.courses) {
          if (read.kind === "course-failure") logFailure(read.error);
        }
      }
      return every;
    },
    async otherCourses(courseId) {
      const others = await readOtherCourses(deps.source, courseId);
      if (others.kind === "root-failure") logFailure(others.error);
      return others;
    },
  };
}
