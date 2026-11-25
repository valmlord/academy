import type { CourseLessons } from "./course/lessons.js";
import { CourseFileError } from "./errors.js";
import { parseWorkspaceLabels, type WorkspaceKey, workspaceNames } from "./identity.js";
import type { IdleTracker } from "./idle.js";
import type { KeyedMutex } from "./lock.js";
import { errorKind } from "./log-fields.js";
import type { ServiceLog } from "./manager.js";
import type { ManagedContainer, ManagedVolume, WorkspaceRuntime } from "./runtime.js";

// Reconcile (design 6.5): after a restart and every 5 minutes, bring the service's memory and the Docker
// objects of this instance back in line. The classification is pure; applying it takes locks and the GC
// primitives, which re-check everything against a fresh inspect.

/** What reconcile does with one managed container (the table of design 6.5 step 3). */
export type Classification =
  /** Running with labels that prove no workspace of ours: stopped gracefully, removed on a later pass. */
  | { kind: "stop" }
  /** Not running and not wanted; never takes the volume. */
  | { kind: "remove"; why: "invalid-labels" | "lesson-gone" | "dead" }
  /** Running and ours: idle stop takes care of it, whether or not its lesson is still in the course. */
  | { kind: "adopt"; id: string; key: WorkspaceKey }
  /** Another schema version owns it: never stopped or removed, so a rollback leaves the newer one alone. */
  | { kind: "other-schema"; schema: string }
  /**
   * Not running and left alone. Its idle entry is left alone too: the listing may be stale, an ensure may have
   * started it since, and the idle sweep already forgets the entry of a container it finds stopped.
   */
  | { kind: "keep" };

/**
 * `course` is `null` when it could not be read in full: then nothing is removed, while running containers are
 * still adopted or stopped, because neither depends on the course.
 */
export function classifyContainer(
  container: ManagedContainer,
  instance: string,
  course: CourseLessons | null,
): Classification {
  const isRunning = container.state === "running";
  const parsed = parseWorkspaceLabels(container.labels, instance);
  if (parsed.kind === "other-schema") return { kind: "other-schema", schema: parsed.schema };
  // Labels that parse but name another workspace than the container's name are as good as invalid.
  if (parsed.kind !== "valid" || workspaceNames(instance, parsed.id).container !== container.name) {
    if (isRunning) return { kind: "stop" };
    return course === null ? { kind: "keep" } : { kind: "remove", why: "invalid-labels" };
  }
  if (isRunning) return { kind: "adopt", id: parsed.id, key: parsed.key };
  if (course === null) return { kind: "keep" };
  if (container.state === "dead") return { kind: "remove", why: "dead" };
  const lesson = course.find(parsed.key.courseId, parsed.key.lessonId);
  if (lesson === undefined || lesson.workspace === null) {
    return { kind: "remove", why: "lesson-gone" };
  }
  return { kind: "keep" };
}

export interface ReconcilerOptions {
  runtime: WorkspaceRuntime;
  readCourse: () => Promise<CourseLessons>;
  instance: string;
  tracker: IdleTracker;
  /** The manager's mutex: every action takes the container name's lock, like ensure, stop and delete. */
  mutex: KeyedMutex;
  log: ServiceLog;
}

/** The volume a container of this name mounts (design 4.2). */
function volumeOf(containerName: string): string {
  return `${containerName}-files`;
}

export class Reconciler {
  readonly #options: ReconcilerOptions;
  // Logged once per object per process: they stay as they are on every later pass.
  readonly #loggedOtherSchema = new Set<string>();
  readonly #loggedVolumes = new Set<string>();

  constructor(options: ReconcilerOptions) {
    this.#options = options;
  }

  /** One pass of design 6.5. Never throws: a failure is logged and the next pass tries again. */
  async runPass(): Promise<void> {
    const { runtime, instance, log } = this.#options;
    let containers: ManagedContainer[];
    try {
      containers = await runtime.listManaged();
    } catch (error: unknown) {
      log.warn(`reconcile: listing containers failed: ${errorKind(error)}`);
      return;
    }
    const course = await this.#readCourse();
    for (const container of containers) {
      try {
        await this.#apply(container, classifyContainer(container, instance, course));
      } catch (error: unknown) {
        log.warn(`reconcile: ${container.containerId}: ${errorKind(error)}`);
      }
    }
    await this.#reportVolumesWithoutContainer(containers);
  }

  /** `null` when any file of the course fails: this pass then removes nothing (design 6.5 step 2). */
  async #readCourse(): Promise<CourseLessons | null> {
    try {
      return await this.#options.readCourse();
    } catch (error: unknown) {
      const detail =
        error instanceof CourseFileError ? `${error.file}: ${error.reason}` : errorKind(error);
      this.#options.log.warn(`course unreadable: ${detail}`);
      return null;
    }
  }

  async #apply(container: ManagedContainer, classification: Classification): Promise<void> {
    const { runtime, tracker, mutex, log } = this.#options;
    const { containerId, name } = container;
    switch (classification.kind) {
      case "adopt":
        if (!tracker.isTracked(classification.id)) {
          tracker.touch(classification.id, classification.key);
        }
        return;
      case "keep":
        return;
      case "other-schema":
        if (this.#loggedOtherSchema.has(containerId)) return;
        this.#loggedOtherSchema.add(containerId);
        log.info(`reconcile: kept ${name} of label schema ${classification.schema}`);
        return;
      case "stop": {
        const result = await mutex.run(name, () => runtime.stopContainer(containerId));
        log.info(`reconcile: stop ${name} (invalid labels): ${result}`);
        return;
      }
      case "remove": {
        const result = await mutex.run(name, () => runtime.removeContainer(containerId));
        log.info(`reconcile: remove ${name} (${classification.why}), volume kept: ${result}`);
        return;
      }
    }
  }

  async #reportVolumesWithoutContainer(containers: readonly ManagedContainer[]): Promise<void> {
    const { runtime, log } = this.#options;
    let volumes: ManagedVolume[];
    try {
      volumes = await runtime.listManagedVolumes();
    } catch (error: unknown) {
      log.warn(`reconcile: listing volumes failed: ${errorKind(error)}`);
      return;
    }
    const mounted = new Set(containers.map((container) => volumeOf(container.name)));
    for (const volume of volumes) {
      if (mounted.has(volume.name) || this.#loggedVolumes.has(volume.name)) continue;
      this.#loggedVolumes.add(volume.name);
      log.info(`reconcile: volume without container: ${volume.name}`);
    }
  }
}
