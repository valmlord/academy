import Docker from "dockerode";
import type { z } from "zod";
import { DockerResponseShapeError } from "../errors.js";
import { classifyDockerError } from "./classify.js";
import { type EngineVersion, engineVersionSchema } from "./schemas.js";

// The only module that talks to dockerode (U-boundary). The Engine API is HTTP over the daemon's unix socket;
// every response is validated before use.

/** Every path is prefixed with it, so a daemon upgrade cannot change the shape of a response (ADR-0002). */
export const ENGINE_API_VERSION = "v1.44";
/**
 * docker-modem's `req.setTimeout`: a socket inactivity timeout. It bounds a silent daemon, not the duration
 * of a call whose response keeps trickling (design 10).
 */
export const ENGINE_TIMEOUT_MS = 30_000;

export interface EngineOptions {
  /** Defaults to docker-modem's choice: `DOCKER_HOST`, else the platform's default socket. */
  socketPath?: string;
  timeoutMs?: number;
}

function parseResponse<T>(operation: string, schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const path = result.error.issues[0]?.path.join(".") ?? "";
  throw new DockerResponseShapeError(operation, path);
}

/** Every dockerode call goes through here, so no raw dockerode error (with Docker's message) leaves the engine. */
async function call(operation: string, request: () => Promise<unknown>): Promise<unknown> {
  try {
    return await request();
  } catch (error: unknown) {
    throw classifyDockerError(operation, error);
  }
}

export class DockerEngine {
  readonly #docker: Docker;

  constructor(options: EngineOptions = {}) {
    this.#docker = new Docker({
      version: ENGINE_API_VERSION,
      timeout: options.timeoutMs ?? ENGINE_TIMEOUT_MS,
      ...(options.socketPath === undefined ? {} : { socketPath: options.socketPath }),
    });
  }

  async ping(): Promise<void> {
    await call("ping", () => this.#docker.ping());
  }

  async version(): Promise<EngineVersion> {
    return parseResponse(
      "version",
      engineVersionSchema,
      await call("version", () => this.#docker.version()),
    );
  }
}
