import Docker from "dockerode";
import type { z } from "zod";
import { DockerApiError, DockerResponseShapeError } from "../errors.js";
import type { ListFilter } from "../identity.js";
import { classifyDockerError } from "./classify.js";
import {
  type ContainerInspect,
  type ContainerSummary,
  containerInspectSchema,
  containerListSchema,
  type EngineVersion,
  engineVersionSchema,
  type ImageInspect,
  imageInspectSchema,
  type NetworkSummary,
  networkListSchema,
  type VolumeInspect,
  volumeInspectSchema,
  volumeListSchema,
} from "./schemas.js";

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

const NOT_FOUND = 404;

/** An inspect whose 404 means "absent", so callers branch on `null` instead of on an error status. */
async function inspectOrNull<T>(
  operation: string,
  schema: z.ZodType<T>,
  request: () => Promise<unknown>,
): Promise<T | null> {
  let value: unknown;
  try {
    value = await call(operation, request);
  } catch (error: unknown) {
    if (error instanceof DockerApiError && error.statusCode === NOT_FOUND) return null;
    throw error;
  }
  return parseResponse(operation, schema, value);
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

  /** By Id or name; `null` when no such container exists. */
  inspectContainer(ref: string): Promise<ContainerInspect | null> {
    return inspectOrNull("inspect container", containerInspectSchema, () =>
      this.#docker.getContainer(ref).inspect(),
    );
  }

  inspectVolume(name: string): Promise<VolumeInspect | null> {
    return inspectOrNull("inspect volume", volumeInspectSchema, () =>
      this.#docker.getVolume(name).inspect(),
    );
  }

  inspectImage(name: string): Promise<ImageInspect | null> {
    return inspectOrNull("inspect image", imageInspectSchema, () =>
      this.#docker.getImage(name).inspect(),
    );
  }

  /**
   * Stopped containers included: reconcile and GC act on them. The filter comes only from `listFilter`, so
   * a list never reaches the owner's or another instance's objects.
   */
  async listContainers(filter: ListFilter): Promise<ContainerSummary[]> {
    const response = await call("list containers", () =>
      this.#docker.listContainers({ all: true, filters: filter }),
    );
    return parseResponse("list containers", containerListSchema, response);
  }

  async listVolumes(filter: ListFilter): Promise<VolumeInspect[]> {
    const response = await call("list volumes", () =>
      this.#docker.listVolumes({ filters: filter }),
    );
    return parseResponse("list volumes", volumeListSchema, response).Volumes;
  }

  async listNetworks(filter: ListFilter): Promise<NetworkSummary[]> {
    const response = await call("list networks", () =>
      this.#docker.listNetworks({ filters: filter }),
    );
    return parseResponse("list networks", networkListSchema, response);
  }
}
