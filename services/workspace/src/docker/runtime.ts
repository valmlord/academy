import type { WorkspaceLimits } from "../config.js";
import { loadStarter } from "../course/starter.js";
import { DockerApiError, WorkspaceIdentityMismatchError } from "../errors.js";
import {
  STARTER_MARKER,
  WORKSPACE_MOUNT,
  type WorkspaceKey,
  workspaceId,
  workspaceNames,
} from "../identity.js";
import type { EnsureOutcome, EnsureResult, WorkspaceSpec } from "../runtime.js";
import type { DockerEngine } from "./engine.js";
import { checkImage, createOrAdoptContainer, ensureVolume, labelsMatchKey } from "./objects.js";
import { NEVER_STARTED_AT } from "./schemas.js";
import type { ContainerSpecInput } from "./spec.js";
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

/**
 * The one real `WorkspaceRuntime` adapter: converges Docker objects to the state a request asks for (design
 * 6.1). It declares the interface once every member exists (S26); until then typecheck cannot demand them.
 */
export class DockerRuntime {
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
