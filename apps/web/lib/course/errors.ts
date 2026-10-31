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

/** The course structure cannot be read: the whole course is unavailable. */
export class CourseReadError extends Error {
  readonly file: string;
  readonly reason: string;
  /** Set once `course.yaml` itself parsed, so the top bar can still link the catalog. */
  readonly courseId: string | undefined;

  constructor(file: string, reason: string, courseId?: string) {
    super(`${file}: ${reason}`);
    this.name = "CourseReadError";
    this.file = file;
    this.reason = reason;
    this.courseId = courseId;
  }
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

/** The image build's export of the learner-visible files failed. */
export class CourseExportError extends Error {
  readonly file: string;
  readonly reason: string;

  constructor(file: string, reason: string) {
    super(`${file}: ${reason}`);
    this.name = "CourseExportError";
    this.file = file;
    this.reason = reason;
  }
}
