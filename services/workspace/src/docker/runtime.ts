import type { WorkspaceLimits } from "../config.js";
import { loadStarter } from "../course/starter.js";
import {
  DockerApiError,
  WorkspaceBusyError,
  WorkspaceIdentityMismatchError,
  WorkspaceNotFoundError,
} from "../errors.js";
import {
  LABEL,
  type Labels,
  listFilter,
  STARTER_MARKER,
  WORKSPACE_MOUNT,
  type WorkspaceKey,
  type WorkspaceNames,
  workspaceId,
  workspaceNames,
} from "../identity.js";
import {
  type EnsureOutcome,
  type EnsureResult,
  exitReasonOf,
  type GcResult,
  type ManagedContainer,
  type WorkspaceExit,
  type WorkspaceInfo,
  type WorkspaceRuntime,
  type WorkspaceSpec,
} from "../runtime.js";
import type { DockerEngine } from "./engine.js";
import { checkImage, createOrAdoptContainer, ensureVolume, labelsMatchKey } from "./objects.js";
import { type ContainerInspect, NEVER_STARTED_AT, type VolumeInspect } from "./schemas.js";
import { type ContainerSpecInput, STOP_TIMEOUT_SECONDS } from "./spec.js";
import { buildStarterTar } from "./tar.js";

export interface DockerRuntimeOptions {
  engine: DockerEngine;
  instance: string;
  courseRoot: string;
  limits: WorkspaceLimits;
  /** The starter tar's mtime; injected so the archive stays a pure function of its inputs. */
  now?: () => Date;
}

const NOT_FOUND = 404;
const CONFLICT = 409;

async function ignoreNotFound(call: Promise<void>): Promise<void> {
  try {
    await call;
  } catch (error: unknown) {
    if (!(error instanceof DockerApiError && error.statusCode === NOT_FOUND)) throw error;
  }
}

/** Only a stopped container that has run has an exit; a never-started one has nothing to report. */
function exitOf(container: ContainerInspect): WorkspaceExit | null {
  const { Running, StartedAt, ExitCode, OOMKilled } = container.State;
  if (Running || StartedAt === NEVER_STARTED_AT) return null;
  return { code: ExitCode, reason: exitReasonOf(OOMKilled, ExitCode) };
}

/**
 * The GC predicate of design 5.1: managed and of this instance, whether or not the key labels parse, because
 * reconcile must be able to clean up a damaged container of its own, never anyone else's.
 */
function isOwnManaged(labels: Labels, instance: string): boolean {
  return labels[LABEL.managed] === "true" && labels[LABEL.instance] === instance;
}

/**
 * The one real `WorkspaceRuntime` adapter: converges Docker objects to the state a request asks for (design
 * 6.1); its `implements` clause is the conformance check against the port.
 */
export class DockerRuntime implements WorkspaceRuntime {
  readonly #engine: DockerEngine;
  readonly #instance: string;
  readonly #courseRoot: string;
  readonly #limits: WorkspaceLimits;
  readonly #now: () => Date;

  constructor(options: DockerRuntimeOptions) {
    this.#engine = options.engine;
    this.#instance = options.instance;
    this.#courseRoot = options.courseRoot;
    this.#limits = options.limits;
    this.#now = options.now ?? (() => new Date());
  }

  /** The dispatcher of design 6.1's table; the caller holds the key lock. */
  async ensureRunning(spec: WorkspaceSpec): Promise<EnsureResult> {
    const input = this.#specInput(spec);
    const existing = await this.#engine.inspectContainer(input.names.container);
    if (existing === null) {
      await ensureVolume(this.#engine, this.#instance, spec.key);
      await checkImage(this.#engine, spec.image);
      const created = await createOrAdoptContainer(this.#engine, input);
      return this.#startNeverStarted(created, spec, input);
    }
    if (!labelsMatchKey(existing.Config.Labels, this.#instance, spec.key, "container")) {
      throw new WorkspaceIdentityMismatchError(input.names.container);
    }
    if (existing.State.Running) {
      return this.#result(spec, "running", existing.Id, existing.Config.Image);
    }
    if (existing.State.StartedAt === NEVER_STARTED_AT) {
      return this.#startNeverStarted(existing.Id, spec, input);
    }
    // A container that has started before is never copied into again: the learner's files are in it.
    const running = await this.#start(existing.Id, spec, input);
    const image = running === existing.Id ? existing.Config.Image : spec.image;
    return this.#result(spec, "started", running, image);
  }

  /**
   * One state from two objects (design 6.2): `null` when neither exists, `stopped` without an image when only
   * the volume does. Either object under our name with labels of another key is a mismatch.
   */
  async inspect(key: WorkspaceKey): Promise<WorkspaceInfo | null> {
    const { container, volume } = await this.#checkedObjects(key);
    if (container === null) return volume === null ? null : this.#view(key, null);
    return this.#view(key, container);
  }

  /**
   * Stops by the inspected Id (304 is success); a volume alone is already stopped (design 6.2). Forgetting the
   * idle entry is the manager's part.
   */
  async stop(key: WorkspaceKey): Promise<WorkspaceInfo> {
    const { container, volume } = await this.#checkedObjects(key);
    if (container === null) {
      if (volume === null) throw new WorkspaceNotFoundError(workspaceId(this.#instance, key));
      return this.#view(key, null);
    }
    await this.#engine.stopContainer(container.Id, STOP_TIMEOUT_SECONDS);
    return this.#view(key, await this.#engine.inspectContainer(container.Id));
  }

  /**
   * Both objects are checked before either is removed, so a foreign volume never costs the learner the
   * container. A 404 on either remove means a concurrent remove got there first; nothing existing is success.
   */
  async remove(key: WorkspaceKey): Promise<void> {
    const { names, container, volume } = await this.#checkedObjects(key);
    if (container !== null) {
      await ignoreNotFound(this.#engine.removeContainer(container.Id, { force: true }));
    }
    if (volume === null) return;
    try {
      await ignoreNotFound(this.#engine.removeVolume(names.volume));
    } catch (error: unknown) {
      if (error instanceof DockerApiError && error.statusCode === CONFLICT) {
        throw new WorkspaceBusyError(workspaceId(this.#instance, key));
      }
      throw error;
    }
  }

  /** Container and volume under the key's names; either with labels of another key is a mismatch (5.1). */
  async #checkedObjects(key: WorkspaceKey): Promise<{
    names: WorkspaceNames;
    container: ContainerInspect | null;
    volume: VolumeInspect | null;
  }> {
    const names = workspaceNames(this.#instance, workspaceId(this.#instance, key));
    const container = await this.#engine.inspectContainer(names.container);
    if (
      container !== null &&
      !labelsMatchKey(container.Config.Labels, this.#instance, key, "container")
    ) {
      throw new WorkspaceIdentityMismatchError(names.container);
    }
    const volume = await this.#engine.inspectVolume(names.volume);
    if (volume !== null && !labelsMatchKey(volume.Labels, this.#instance, key, "volume")) {
      throw new WorkspaceIdentityMismatchError(names.volume);
    }
    return { names, container, volume };
  }

  #view(key: WorkspaceKey, container: ContainerInspect | null): WorkspaceInfo {
    return {
      id: workspaceId(this.#instance, key),
      key,
      state: container?.State.Running === true ? "running" : "stopped",
      containerId: container?.Id ?? null,
      image: container?.Config.Image ?? null,
      exit: container === null ? null : exitOf(container),
    };
  }

  /** Every managed container of this instance, stopped ones included; reconcile parses their labels. */
  async listManaged(): Promise<ManagedContainer[]> {
    const containers = await this.#engine.listContainers(listFilter(this.#instance));
    return containers.map((container) => ({
      containerId: container.Id,
      name: (container.Names[0] ?? "").replace(/^\//, ""),
      labels: container.Labels,
      state: container.State,
    }));
  }

  /** GC primitive: stops a running container of this instance by Id, after a fresh inspect (design 5.1). */
  async stopContainer(containerId: string): Promise<GcResult> {
    const current = await this.#gcInspect(containerId);
    if (current === null) return "gone";
    if (!current.State.Running) return "state-changed";
    try {
      await this.#engine.stopContainer(current.Id, STOP_TIMEOUT_SECONDS);
    } catch (error: unknown) {
      if (error instanceof DockerApiError && error.statusCode === NOT_FOUND) return "gone";
      throw error;
    }
    return "done";
  }

  /**
   * GC primitive: removes a container of this instance that is not running. Never forced, so a container that
   * started after the inspect makes Docker answer 409, which is also `state-changed`.
   */
  async removeContainer(containerId: string): Promise<GcResult> {
    const current = await this.#gcInspect(containerId);
    if (current === null) return "gone";
    if (current.State.Running) return "state-changed";
    try {
      await this.#engine.removeContainer(current.Id, { force: false });
    } catch (error: unknown) {
      if (!(error instanceof DockerApiError)) throw error;
      if (error.statusCode === NOT_FOUND) return "gone";
      if (error.statusCode === CONFLICT) return "state-changed";
      throw error;
    }
    return "done";
  }

  /** `null` when the container is gone; a container failing the GC predicate is refused by its Id. */
  async #gcInspect(containerId: string): Promise<ContainerInspect | null> {
    const current = await this.#engine.inspectContainer(containerId);
    if (current === null) return null;
    if (!isOwnManaged(current.Config.Labels, this.#instance)) {
      throw new WorkspaceIdentityMismatchError(containerId);
    }
    return current;
  }

  #specInput(spec: WorkspaceSpec): ContainerSpecInput {
    const names = workspaceNames(this.#instance, workspaceId(this.#instance, spec.key));
    return {
      image: spec.image,
      instance: this.#instance,
      key: spec.key,
      names,
      limits: this.#limits,
    };
  }

  /** The marker, the last tar entry, is what tells a complete copy from a crash during one (6.1 (b)-(d)). */
  async #startNeverStarted(
    containerId: string,
    spec: WorkspaceSpec,
    input: ContainerSpecInput,
  ): Promise<EnsureResult> {
    const copied = await this.#copyStarterUnlessMarked(containerId, spec);
    const running = await this.#start(containerId, spec, input);
    return this.#result(spec, copied ? "created" : "started", running, spec.image);
  }

  /** Copies the starter (overwriting a partial copy) when the marker is absent; returns whether it copied. */
  async #copyStarterUnlessMarked(containerId: string, spec: WorkspaceSpec): Promise<boolean> {
    if (await this.#engine.pathExists(containerId, STARTER_MARKER)) return false;
    const { lessonDir, relPath } = spec.starter;
    const items = await loadStarter(this.#courseRoot, lessonDir, relPath);
    const tar = await buildStarterTar(items, this.#now());
    await this.#engine.putArchive(containerId, WORKSPACE_MOUNT, tar);
    return true;
  }

  /**
   * Starts the container and returns the Id that runs. A start 404 on a container just inspected means its
   * network is gone (pruned by hand): the container is removed by Id after re-checking its labels and created
   * again, which ensures the network first. One retry; a second failure reaches the caller.
   */
  async #start(
    containerId: string,
    spec: WorkspaceSpec,
    input: ContainerSpecInput,
  ): Promise<string> {
    try {
      await this.#engine.startContainer(containerId);
      return containerId;
    } catch (error: unknown) {
      if (!(error instanceof DockerApiError && error.statusCode === NOT_FOUND)) throw error;
    }
    await this.#removeChecked(containerId, spec.key, input.names.container);
    const recreated = await createOrAdoptContainer(this.#engine, input);
    await this.#copyStarterUnlessMarked(recreated, spec);
    await this.#engine.startContainer(recreated);
    return recreated;
  }

  async #removeChecked(containerId: string, key: WorkspaceKey, name: string): Promise<void> {
    const current = await this.#engine.inspectContainer(containerId);
    if (current === null) return;
    if (!labelsMatchKey(current.Config.Labels, this.#instance, key, "container")) {
      throw new WorkspaceIdentityMismatchError(name);
    }
    await this.#engine.removeContainer(current.Id, { force: false });
  }

  /** `image` is what the running container was created from, which for an older container may not be the spec's. */
  #result(
    spec: WorkspaceSpec,
    outcome: EnsureOutcome,
    containerId: string,
    image: string,
  ): EnsureResult {
    return {
      outcome,
      workspace: {
        id: workspaceId(this.#instance, spec.key),
        key: spec.key,
        state: "running",
        containerId,
        image,
        exit: null,
      },
    };
  }
}
