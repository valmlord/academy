import { Course } from "@academy/lesson-schema/schema";

// Every dedicated error of the service (design section 10). Messages name the entity and a closed rule or
// reason. They never copy a system error's or Docker's message, and a value from a course file's text only
// once the lesson schema has accepted it.

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
 * A course file the file layer refused or could not read. `file` is relative to the course root (`.` for the
 * root itself) and `reason` is a reason, a schema issue's path and code, or a duplicated lesson id, so
 * the message never carries a system error's text, which would hold the absolute path.
 */
export class CourseFileError extends Error {
  readonly file: string;
  readonly reason: string;

  constructor(relativeFile: string, reason: string) {
    super(`${relativeFile}: ${reason}`);
    this.name = "CourseFileError";
    this.file = relativeFile;
    this.reason = reason;
  }
}

/**
 * A course id as an operator line prints it: as-is in the lesson schema's id form, else JSON-quoted, so a
 * directory name can neither break the line nor pass for the `root:` prefix.
 */
export function describeCourseId(courseId: string): string {
  return Course.shape.id.safeParse(courseId).success ? courseId : JSON.stringify(courseId);
}

/**
 * The course root cannot be listed or lists no course: every course is unavailable. The message is the
 * operator form `root: <file>: <reason>`.
 */
export class CourseRootReadError extends Error {
  readonly file: string;
  readonly reason: string;

  constructor(relativeFile: string, reason: string) {
    super(`root: ${relativeFile}: ${reason}`);
    this.name = "CourseRootReadError";
    this.file = relativeFile;
    this.reason = reason;
  }
}

/**
 * One course cannot be read; the other courses are not affected. The message is the operator form
 * `course <id>: <file>: <reason>`, the id as `describeCourseId` prints it.
 */
export class CourseReadError extends Error {
  /** The directory name, known before any file is opened. */
  readonly courseId: string;
  readonly file: string;
  readonly reason: string;

  constructor(courseId: string, relativeFile: string, reason: string) {
    super(`course ${describeCourseId(courseId)}: ${relativeFile}: ${reason}`);
    this.name = "CourseReadError";
    this.courseId = courseId;
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

/**
 * A lesson's `checks/` cannot be delivered to a grader (the contract's stage `checks-missing`). `path` is
 * relative to the course root and `reason` is one of the closed reasons of design section 10, so the message
 * never carries a checks file's content, which holds the expected answers.
 */
export class ChecksRefusedError extends Error {
  readonly path: string;
  readonly reason: string;

  constructor(relativePath: string, reason: string) {
    super(`checks refused: ${relativePath}: ${reason}`);
    this.name = "ChecksRefusedError";
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

/**
 * A Docker Engine response does not have the shape the service relies on (HTTP 502 `docker-response-invalid`).
 * Names the operation and the path of the first failing field, built from schema field names and array indices
 * with each label key replaced by `<key>` (`describeIssuePath`), so it holds nothing Docker sent. `issuePath` is
 * printed as given: pass a path from `describeIssuePath` or a literal.
 */
export class DockerResponseShapeError extends Error {
  readonly operation: string;
  readonly issuePath: string;

  constructor(operation: string, issuePath: string) {
    super(
      `unexpected Docker response to ${operation} at ${issuePath === "" ? "(root)" : issuePath}`,
    );
    this.name = "DockerResponseShapeError";
    this.operation = operation;
    this.issuePath = issuePath;
  }
}

/**
 * The Docker daemon cannot be reached (HTTP 503 `docker-unavailable`): the socket is missing or refused, or the
 * connection was cut, which is also how docker-modem reports its own timeout. `errnoCode` is Node's code.
 */
export class DockerUnavailableError extends Error {
  readonly operation: string;
  readonly errnoCode: string;

  constructor(operation: string, errnoCode: string) {
    super(`Docker is unavailable during ${operation} (${errnoCode})`);
    this.name = "DockerUnavailableError";
    this.operation = operation;
    this.errnoCode = errnoCode;
  }
}

/**
 * Docker answered with an error status (HTTP 502 `docker-error`); `statusCode` is 0 when the failure had no
 * status. Docker's own message is never copied: it echoes request content, and the exec create body of a terminal
 * shell carries the agent API key (ADR-0002 item 14).
 */
export class DockerApiError extends Error {
  readonly operation: string;
  readonly statusCode: number;

  constructor(operation: string, statusCode: number) {
    super(`Docker API error during ${operation} (status ${statusCode})`);
    this.name = "DockerApiError";
    this.operation = operation;
    this.statusCode = statusCode;
  }
}

/** The workspace image is not on the daemon (HTTP 409 `image-missing`); the service never pulls (design 4.3). */
export class ImageMissingError extends Error {
  readonly image: string;

  constructor(image: string) {
    super(`image missing: ${image}`);
    this.name = "ImageMissingError";
    this.image = image;
  }
}

/**
 * An object with a workspace's name does not carry the labels of that workspace (HTTP 500
 * `workspace-identity-mismatch`): a foreign object, another schema's, or damaged labels. Nothing was changed.
 * `objectName` is the Docker name (or the Id, for a GC primitive) the service derived or was given.
 */
export class WorkspaceIdentityMismatchError extends Error {
  readonly objectName: string;

  constructor(objectName: string) {
    super(`workspace identity mismatch: ${objectName}`);
    this.name = "WorkspaceIdentityMismatchError";
    this.objectName = objectName;
  }
}

/** The lesson exists but declares no `workspace` (HTTP 422 `lesson-has-no-workspace`). */
export class LessonHasNoWorkspaceError extends Error {
  readonly courseId: string;
  readonly lessonId: string;

  constructor(courseId: string, lessonId: string) {
    super(`lesson has no workspace: ${courseId}/${lessonId}`);
    this.name = "LessonHasNoWorkspaceError";
    this.courseId = courseId;
    this.lessonId = lessonId;
  }
}

/** Activity for a workspace the service does not track as running (HTTP 409 `workspace-not-running`). */
export class WorkspaceNotRunningError extends Error {
  readonly id: string;

  constructor(id: string) {
    super(`workspace not running: ${id}`);
    this.name = "WorkspaceNotRunningError";
    this.id = id;
  }
}

/** Neither container nor volume exists for the key (HTTP 404 `workspace-not-found`). `id` is the derived id. */
export class WorkspaceNotFoundError extends Error {
  readonly id: string;

  constructor(id: string) {
    super(`workspace not found: ${id}`);
    this.name = "WorkspaceNotFoundError";
    this.id = id;
  }
}

/** Docker refused to remove the volume because a container still uses it (HTTP 409 `workspace-busy`). */
export class WorkspaceBusyError extends Error {
  readonly id: string;

  constructor(id: string) {
    super(`workspace busy: ${id}: its volume is still in use`);
    this.name = "WorkspaceBusyError";
    this.id = id;
  }
}

/**
 * A container create answered 409 (the name is taken), yet no container of that name became inspectable within
 * the bounded re-inspects (HTTP 502 `docker-error`, design amendment 1). Deliberately not a `DockerApiError`: no `statusCode === 409`
 * branch may read it as a conflict again, and Docker's original answer is not passed off as the result. The
 * caller's retry of the idempotent ensure converges.
 */
export class ContainerNameUnresolvedError extends Error {
  readonly containerName: string;
  readonly waitedMs: number;

  constructor(containerName: string, waitedMs: number) {
    super(`container name taken but no container found: ${containerName} (waited ${waitedMs} ms)`);
    this.name = "ContainerNameUnresolvedError";
    this.containerName = containerName;
    this.waitedMs = waitedMs;
  }
}

/** What decided a `CheckNotStartedError`: the Docker call that failed, or the check that refused. */
export type CheckNotStartedReason =
  | "inspect"
  | "identity-mismatch"
  | "container-missing"
  | "container-stopped"
  | "archive"
  | "exec-create"
  | "exec-start";

/**
 * A check could not be started; `stage` is the contract's. `cause` is the error that decided it, `null` for a
 * missing or stopped container, so a caller can log its status; the message carries neither Docker's text nor the
 * check's `run`.
 */
export class CheckNotStartedError extends Error {
  readonly stage: "container-not-running" | "exec-create" | "exec-start";
  readonly reason: CheckNotStartedReason;

  constructor(
    stage: "container-not-running" | "exec-create" | "exec-start",
    reason: CheckNotStartedReason,
    cause: unknown,
  ) {
    super(`check not started at ${stage}: ${reason}`, { cause });
    this.name = "CheckNotStartedError";
    this.stage = stage;
    this.reason = reason;
  }
}
