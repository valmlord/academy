import type { FastifyBaseLogger, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  ContainerNameUnresolvedError,
  CourseReadError,
  DockerApiError,
  DockerResponseShapeError,
  DockerUnavailableError,
  ImageMissingError,
  InvalidWorkspaceKeyError,
  LessonHasNoWorkspaceError,
  LessonNotFoundError,
  StarterRefusedError,
  StarterTooLargeError,
  WorkspaceBusyError,
  WorkspaceIdentityMismatchError,
  WorkspaceNotFoundError,
  WorkspaceNotRunningError,
} from "../errors.js";
import { errorCode, errorKind } from "../log-fields.js";

// The closed error contract of design 7 and ADR-0010: every non-2xx answer is `{ error: { code, message } }`.
// Our own classes carry messages built for this (no secret, file contents or Docker text, design 10); anything
// else becomes 500 `internal` and is logged by constructor name and code only, because its message may hold
// anything.

export interface ErrorBody {
  error: { code: string; message: string; image?: string };
}

interface MappedError {
  status: number;
  body: ErrorBody;
}

type ErrorClass = abstract new (...args: never[]) => Error;

/** Our classes, in the order checked; each answer's status and code are ADR-0010's. */
const CLASS_MAP: ReadonlyArray<readonly [ErrorClass, number, string]> = [
  [InvalidWorkspaceKeyError, 400, "invalid-workspace-key"],
  [LessonNotFoundError, 404, "lesson-not-found"],
  [WorkspaceNotFoundError, 404, "workspace-not-found"],
  [ImageMissingError, 409, "image-missing"],
  [WorkspaceNotRunningError, 409, "workspace-not-running"],
  [WorkspaceBusyError, 409, "workspace-busy"],
  [LessonHasNoWorkspaceError, 422, "lesson-has-no-workspace"],
  [StarterRefusedError, 500, "starter-invalid"],
  [StarterTooLargeError, 500, "starter-invalid"],
  [CourseReadError, 500, "course-unreadable"],
  [WorkspaceIdentityMismatchError, 500, "workspace-identity-mismatch"],
  [DockerApiError, 502, "docker-error"],
  // Docker answered, but contradicted itself (name taken, no container); a retry of the ensure converges.
  [ContainerNameUnresolvedError, 502, "docker-error"],
  [DockerResponseShapeError, 502, "docker-response-invalid"],
  [DockerUnavailableError, 503, "docker-unavailable"],
];

const BAD_REQUEST_MESSAGE = "the request could not be processed";
const NOT_FOUND = 404;
const BAD_REQUEST = 400;
const INTERNAL = 500;

function body(code: string, message: string): ErrorBody {
  return { error: { code, message } };
}

/** Fastify's own client errors (`FST_ERR_CTP_*`, `FST_ERR_BAD_URL`, ...): their status, never their message. */
function frameworkClientError(error: unknown): { status: number; code: string } | null {
  if (typeof error !== "object" || error === null) return null;
  const code: unknown = Reflect.get(error, "code");
  const status: unknown = Reflect.get(error, "statusCode");
  if (typeof code !== "string" || !code.startsWith("FST_")) return null;
  if (typeof status !== "number" || status < 400 || status > 499) return null;
  return { status, code };
}

export function mapError(error: unknown): MappedError {
  for (const [errorClass, status, code] of CLASS_MAP) {
    if (!(error instanceof errorClass)) continue;
    const mapped: MappedError = { status, body: body(code, error.message) };
    if (error instanceof ImageMissingError) mapped.body.error.image = error.image;
    return mapped;
  }
  const framework = frameworkClientError(error);
  if (framework !== null) {
    return {
      status: framework.status,
      body: body("bad-request", `${BAD_REQUEST_MESSAGE} (${framework.code})`),
    };
  }
  return { status: INTERNAL, body: body("internal", "internal error") };
}

function describeForLog(error: unknown): string {
  const kind = errorKind(error);
  const isOurs = CLASS_MAP.some(([errorClass]) => error instanceof errorClass);
  if (isOurs && error instanceof Error) return `${kind}: ${error.message}`;
  const code = errorCode(error);
  return code === null ? kind : `${kind} (code ${code})`;
}

function logFailure(log: FastifyBaseLogger, status: number, error: unknown): void {
  const line = `request failed with ${String(status)}: ${describeForLog(error)}`;
  if (status >= INTERNAL) log.error(line);
  else log.info(line);
}

/** Passed to the Fastify constructor: bad URLs and the like, before routing and hooks. */
export function frameworkErrors(
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  const code: unknown =
    typeof error === "object" && error !== null ? Reflect.get(error, "code") : undefined;
  logFailure(request.log, BAD_REQUEST, error);
  void reply
    .code(BAD_REQUEST)
    .send(
      body(
        "bad-request",
        `${BAD_REQUEST_MESSAGE} (${typeof code === "string" ? code : "unknown"})`,
      ),
    );
}

export function installErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error: unknown, request, reply) => {
    const { status, body: errorBody } = mapError(error);
    logFailure(request.log, status, error);
    return reply.code(status).send(errorBody);
  });
  // A route, not a hook: the root auth hook runs before it, so an unknown route also needs the secret.
  app.setNotFoundHandler((_request, reply) =>
    reply.code(NOT_FOUND).send(body("route-not-found", "no such route")),
  );
}
