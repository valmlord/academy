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

/**
 * A Docker Engine response does not have the shape the service relies on (HTTP 502 `docker-response-invalid`).
 * Names the operation and the path of the first failing field, never the value Docker sent.
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
 * status. Docker's own message is never copied: it echoes request content, which from #33 on can hold a key.
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
