// Every dedicated error of the service (design section 10). Messages name the entity and a closed rule or
// reason, never a value read from the environment, a file or Docker, so they are safe to log and to answer.

/** An environment variable is missing or breaks its rule. The message never carries the value. */
export class InvalidConfigError extends Error {
  readonly variable: string;
  readonly rule: string;

  constructor(variable: string, rule: string) {
    super(`${variable}: ${rule}`);
    this.name = "InvalidConfigError";
    this.variable = variable;
    this.rule = rule;
  }
}

/** One part of a workspace key breaks its rule. Names the field only: the value is request input. */
export class InvalidWorkspaceKeyError extends Error {
  readonly field: string;

  constructor(field: string) {
    super(`invalid workspace key: ${field}`);
    this.name = "InvalidWorkspaceKeyError";
    this.field = field;
  }
}

/**
 * A course file was refused or could not be read; the whole course is unavailable (design 6.5). `file` is
 * relative to the course root (`.` for the root itself) and `reason` comes from a closed set, so the
 * message never carries file contents or a system error's text, which would hold the absolute path.
 */
export class CourseReadError extends Error {
  readonly file: string;
  readonly reason: string;

  constructor(relativeFile: string, reason: string) {
    super(`${relativeFile}: ${reason}`);
    this.name = "CourseReadError";
    this.file = relativeFile;
    this.reason = reason;
  }
}

/** The course has no lesson with this id (HTTP 404 `lesson-not-found`). Ids are validated slugs. */
export class LessonNotFoundError extends Error {
  readonly courseId: string;
  readonly lessonId: string;

  constructor(courseId: string, lessonId: string) {
    super(`lesson not found: ${courseId}/${lessonId}`);
    this.name = "LessonNotFoundError";
    this.courseId = courseId;
    this.lessonId = lessonId;
  }
}

/**
 * A lesson's starter cannot be copied (HTTP 500 `starter-invalid`). `path` is relative to the course root and
 * `reason` is one of the closed reasons of design 5.4; several inputs are refused by more than one rule, and
 * the reason says which rule fired.
 */
export class StarterRefusedError extends Error {
  readonly path: string;
  readonly reason: string;

  constructor(relativePath: string, reason: string) {
    super(`starter refused: ${relativePath}: ${reason}`);
    this.name = "StarterRefusedError";
    this.path = relativePath;
    this.reason = reason;
  }
}

/** A starter exceeds a copy cap, measured from `lstat` before any byte is read (design 4.4). */
export class StarterTooLargeError extends Error {
  readonly path: string;
  readonly limit: string;

  constructor(relativePath: string, limit: string) {
    super(`starter too large: ${relativePath}: more than ${limit}`);
    this.name = "StarterTooLargeError";
    this.path = relativePath;
    this.limit = limit;
  }
}
