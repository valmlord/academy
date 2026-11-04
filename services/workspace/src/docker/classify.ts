import { DockerApiError, DockerUnavailableError } from "../errors.js";
import { errnoErrorSchema, statusErrorSchema } from "./schemas.js";

/**
 * Codes that mean "no daemon to talk to". A connect on a unix socket fails with the first three;
 * `ECONNRESET` ("socket hang up") is what docker-modem's timeout produces (it destroys the request without an
 * error) and what a daemon restart in the middle of a request looks like (design 10).
 */
const UNAVAILABLE_CODES: ReadonlySet<string> = new Set([
  "ENOENT",
  "ECONNREFUSED",
  "EACCES",
  "ECONNRESET",
]);

/** Turns whatever dockerode rejected with into one of the service's two Docker errors. */
export function classifyDockerError(
  operation: string,
  error: unknown,
): DockerUnavailableError | DockerApiError {
  const errno = errnoErrorSchema.safeParse(error);
  if (errno.success && UNAVAILABLE_CODES.has(errno.data.code)) {
    return new DockerUnavailableError(operation, errno.data.code);
  }
  const status = statusErrorSchema.safeParse(error);
  return new DockerApiError(operation, status.success ? status.data.statusCode : 0);
}
