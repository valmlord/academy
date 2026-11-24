import {
  type CourseList,
  type CourseLookup,
  type CourseSource,
  listCourseNames,
  readCourseById,
} from "./courses";
import { type CourseReadError, type CourseRootReadError, describeCourseFailure } from "./errors";

// The request-side reads with their operator line, outside the server-only wiring so a test can pin the line.
// A `not-found` logs nothing: its id came from a browser and names no course.

export interface CourseReads {
  /** Logs a course failure or a root failure as `web: course read failed: ...`. */
  courseById(courseId: unknown): Promise<CourseLookup>;
  /** Logs a root failure as `web: course read failed: root: ...`. */
  listNames(): Promise<CourseList>;
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
  };
}
