import { Course } from "@academy/lesson-schema/schema";

// One internal file error, mapped to a separate type per caller (ADR-0009 item 7). Every `file` is relative
// to the course root and every `reason` comes from a closed set, so no message carries file contents or a
// system error's text (which would hold the absolute path).

/**
 * How an error names the course root itself, whose relative path is empty: `.: missing` points the
 * operator at `COURSE_ROOT`, where an empty name would print `: missing`.
 */
export const COURSE_ROOT_FILE = ".";

/** A course file the file-system layer refused or could not read. Never reaches a page. */
export class CourseFileError extends Error {
  readonly file: string;
  readonly reason: string;

  constructor(file: string, reason: string) {
    super(`${file}: ${reason}`);
    this.name = "CourseFileError";
    this.file = file;
    this.reason = reason;
  }
}

/** The course root cannot be resolved or listed, or it holds no course: every course is unavailable. */
export class CourseRootReadError extends Error {
  readonly file: string;
  readonly reason: string;

  constructor(file: string, reason: string) {
    super(`${file}: ${reason}`);
    this.name = "CourseRootReadError";
    this.file = file;
    this.reason = reason;
  }
}

/** One course's structure cannot be read: that course is unavailable, the others are not. */
export class CourseReadError extends Error {
  /** The failing course's directory name, known before any file is opened. */
  readonly courseId: string;
  readonly file: string;
  readonly reason: string;
  /**
   * The `title` of the course's own `course.yaml` when that file parsed with an id equal to the directory name
   * and a module or lesson file of the course failed; `undefined` when the failure came before or at `course.yaml`. Not
   * part of the message, so no operator line carries it.
   */
  readonly title: string | undefined;

  constructor(courseId: string, file: string, reason: string, title?: string) {
    super(`${file}: ${reason}`);
    this.name = "CourseReadError";
    this.courseId = courseId;
    this.file = file;
    this.reason = reason;
    this.title = title;
  }
}

/** A root that lists no real directory: the repository ships `course/`, so it is a misconfiguration. */
export const NO_COURSE = "no course";
/** `course.yaml`'s `id` differs from its directory's name, which is the course id. */
export const ID_IS_NOT_THE_DIRECTORY_NAME = "id is not the directory name";
/** A listed directory whose name no URL can reach, so no file of it is opened. */
export const DIRECTORY_NAME_IS_NOT_A_COURSE_ID = "directory name is not a course id";

/**
 * A course id as an operator line prints it: as-is in the lesson schema's id form, else JSON-quoted, so a
 * directory name can neither break the line nor pass for the `root:` prefix.
 */
export function describeCourseId(courseId: string): string {
  return Course.shape.id.safeParse(courseId).success ? courseId : JSON.stringify(courseId);
}

/** `course <id>: <file>: <reason>` or `root: <file>: <reason>`, the one form of every operator line. */
export function describeCourseFailure(error: CourseReadError | CourseRootReadError): string {
  if (error instanceof CourseRootReadError) return `root: ${error.file}: ${error.reason}`;
  return `course ${describeCourseId(error.courseId)}: ${error.file}: ${error.reason}`;
}

/** One lesson's theory.md or task.md cannot be read: only that tab shows the error. */
export class LessonTextReadError extends Error {
  readonly file: string;
  readonly reason: string;

  constructor(file: string, reason: string) {
    super(`${file}: ${reason}`);
    this.name = "LessonTextReadError";
    this.file = file;
    this.reason = reason;
  }
}

/** The image build's export of the learner-visible files failed, for the root or for one course. */
export class CourseExportError extends Error {
  constructor(failure: CourseReadError | CourseRootReadError) {
    super(describeCourseFailure(failure));
    this.name = "CourseExportError";
  }
}
