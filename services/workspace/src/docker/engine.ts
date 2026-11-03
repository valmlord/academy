import Docker from "dockerode";
import type { z } from "zod";
import { DockerApiError, DockerResponseShapeError } from "../errors.js";
import type { Labels, ListFilter } from "../identity.js";
import { classifyDockerError } from "./classify.js";
import {
  type ContainerInspect,
  type ContainerSummary,
  containerInspectSchema,
  containerListSchema,
  type EngineVersion,
  engineVersionSchema,
  type ImageInspect,
  idHandleSchema,
  imageInspectSchema,
  type NetworkSummary,
  networkListSchema,
  type VolumeInspect,
  volumeHandleSchema,
  volumeInspectSchema,
  volumeListSchema,
} from "./schemas.js";
import type { ContainerCreateBody } from "./spec.js";

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

/** Start and stop answer it when the container is already in the requested state. */
const NOT_MODIFIED = 304;

/** A start or stop whose 304 is success: the caller wants the state, not the transition. */
async function changeState(operation: string, request: () => Promise<unknown>): Promise<void> {
  try {
    await call(operation, request);
  } catch (error: unknown) {
    if (error instanceof DockerApiError && error.statusCode === NOT_MODIFIED) return;
    throw error;
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

  /**
   * Idempotent: Docker answers an existing name with that volume instead of a conflict, so a create proves
   * nothing about whose volume it is; the caller checks the labels by inspecting (design 6.1 `ensureVolume`).
   * Returns the volume's name.
   */
  async createVolume(name: string, labels: Labels): Promise<string> {
    const handle = await call("create volume", () =>
      this.#docker.createVolume({ _query: {}, _body: { Name: name, Labels: { ...labels } } }),
    );
    return parseResponse("create volume", volumeHandleSchema, handle).name;
  }

  /** 404 and 409 (in use) reach the caller as `DockerApiError`. */
  async removeVolume(name: string): Promise<void> {
    await call("remove volume", () => this.#docker.getVolume(name).remove());
  }

  /**
   * Returns the new network's Id. An existing name is answered with 409 (`DockerApiError`), which the caller
   * reads as "someone else holds this name" and resolves by listing (design 6.1 `ensureNetwork`).
   */
  async createNetwork(name: string, labels: Labels): Promise<string> {
    const handle = await call("create network", () =>
      this.#docker.createNetwork({ _query: {}, _body: { Name: name, Labels: { ...labels } } }),
    );
    return parseResponse("create network", idHandleSchema, handle).id;
  }

  /** By Id, never by name: a name alone does not prove which object it is. */
  async removeNetwork(id: string): Promise<void> {
    await call("remove network", () => this.#docker.getNetwork(id).remove());
  }

  /**
   * Returns the new container's Id. A taken name is 409 and a missing image or network is 404, both as
   * `DockerApiError`: the name is the cross-process lock the caller resolves by re-inspecting (design 6.1).
   */
  async createContainer(name: string, body: ContainerCreateBody): Promise<string> {
    const handle = await call("create container", () =>
      this.#docker.createContainer({ _query: { name }, _body: body }),
    );
    return parseResponse("create container", idHandleSchema, handle).id;
  }

  /** 304 (already running) is success; 404 reaches the caller, whose retry is keyed on it (design 6.1). */
  async startContainer(id: string): Promise<void> {
    await changeState("start container", () => this.#docker.getContainer(id).start());
  }

  /** 304 (already stopped) is success. */
  async stopContainer(id: string, timeoutSeconds: number): Promise<void> {
    await changeState("stop container", () =>
      this.#docker.getContainer(id).stop({ t: timeoutSeconds }),
    );
  }

  /**
   * By Id. Without `force` a running container is refused with 409, which GC reads as "it started
   * meanwhile" (design 5.1). Docker's volume flag is never sent, so a container remove never takes a volume.
   */
  async removeContainer(id: string, options: { force: boolean }): Promise<void> {
    await call("remove container", () =>
      this.#docker.getContainer(id).remove({ force: options.force }),
    );
  }

  /**
   * Extracts an in-memory tar at `path` inside the container; works on a never-started container, whose volume
   * Docker mounts for the copy (P1). Ownership and modes come from the tar headers.
   */
  async putArchive(id: string, path: string, tar: Buffer): Promise<void> {
    await call("put archive", () => this.#docker.getContainer(id).putArchive(tar, { path }));
  }

  /**
   * Whether `path` exists in the container, by `HEAD /archive` (also on a never-started container, P2). Docker
   * answers 404 for a missing path and for a missing container alike, so both read as `false`.
   */
  async pathExists(id: string, path: string): Promise<boolean> {
    let response: unknown;
    try {
      response = await call("stat path", () => this.#docker.getContainer(id).infoArchive({ path }));
    } catch (error: unknown) {
      if (error instanceof DockerApiError && error.statusCode === NOT_FOUND) return false;
      throw error;
    }
    destroyStream("stat path", response);
    return true;
  }
}

/**
 * dockerode resolves `HEAD /archive` with the response stream itself. An unconsumed stream keeps its socket
 * open, so every successful HEAD ends here, before its result is used.
 */
function destroyStream(operation: string, response: unknown): void {
  if (
    typeof response !== "object" ||
    response === null ||
    !("destroy" in response) ||
    typeof response.destroy !== "function"
  ) {
    throw new DockerResponseShapeError(operation, "destroy");
  }
  response.destroy();
}
