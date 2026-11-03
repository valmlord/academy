import type { CourseLessons } from "./course/lessons.js";
import {
  DockerUnavailableError,
  LessonHasNoWorkspaceError,
  WorkspaceNotFoundError,
  WorkspaceNotRunningError,
} from "./errors.js";
import { type WorkspaceKey, workspaceId, workspaceNames } from "./identity.js";
import type { IdleTracker, IdleWindow } from "./idle.js";
import type { KeyedMutex } from "./lock.js";
import type { EnsureOutcome, WorkspaceInfo, WorkspaceRuntime } from "./runtime.js";

// The lifecycle rules above the runtime (design 4.8, 6.3, 6.4): one lock per workspace, the lesson lookup
// that only an ensure needs, and the idle timers. Docker stays behind `WorkspaceRuntime`.

/** A workspace as the API shows it: the runtime's view plus the idle window of a running one. */
export interface WorkspaceView extends WorkspaceInfo {
  idle: IdleWindow | null;
}

export interface EnsureView {
  outcome: EnsureOutcome;
  workspace: WorkspaceView;
}

/** The two levels the manager logs at; pino's logger satisfies it. */
export interface ServiceLog {
  info(message: string): void;
  warn(message: string): void;
}

export interface ManagerOptions {
  runtime: WorkspaceRuntime;
  /** Reads the whole course; only an ensure calls it, so a lesson that left the course stays stoppable. */
  readCourse: () => Promise<CourseLessons>;
  instance: string;
  /** `WORKSPACE_IMAGE`: replaces every lesson's image when set. */
  imageOverride: string | null;
  tracker: IdleTracker;
  mutex: KeyedMutex;
  log: ServiceLog;
  /** The clock of the idle sweep; the same one the tracker uses. */
  now: () => number;
}

export class WorkspaceManager {
  readonly #options: ManagerOptions;

  constructor(options: ManagerOptions) {
    this.#options = options;
  }

  /** The lock key of design 4.2: the container name, also for keys whose objects do not exist yet. */
  lockKey(key: WorkspaceKey): string {
    const { instance } = this.#options;
    return workspaceNames(instance, workspaceId(instance, key)).container;
  }

  async ensure(key: WorkspaceKey): Promise<EnsureView> {
    const { runtime, readCourse, imageOverride, tracker, mutex } = this.#options;
    const lesson = (await readCourse()).lesson(key.courseId, key.lessonId);
    if (lesson.workspace === null) {
      throw new LessonHasNoWorkspaceError(key.courseId, key.lessonId);
    }
    const { image, starter } = lesson.workspace;
    return mutex.run(this.lockKey(key), async () => {
      const result = await runtime.ensureRunning({
        key,
        image: imageOverride ?? image,
        starter: { lessonDir: lesson.lessonDir, relPath: starter },
      });
      tracker.touch(result.workspace.id, key);
      return { outcome: result.outcome, workspace: this.#view(result.workspace) };
    });
  }

  /** Without the lock (design 6.3): a read never waits behind a slow ensure. */
  async get(key: WorkspaceKey): Promise<WorkspaceView> {
    const info = await this.#options.runtime.inspect(key);
    if (info === null) throw new WorkspaceNotFoundError(workspaceId(this.#options.instance, key));
    return this.#view(info);
  }

  async stop(key: WorkspaceKey): Promise<WorkspaceView> {
    const { runtime, tracker, mutex } = this.#options;
    return mutex.run(this.lockKey(key), async () => {
      const info = await runtime.stop(key);
      tracker.forget(info.id);
      return this.#view(info);
    });
  }

  async remove(key: WorkspaceKey): Promise<void> {
    const { runtime, tracker, mutex, instance } = this.#options;
    await mutex.run(this.lockKey(key), async () => {
      await runtime.remove(key);
      tracker.forget(workspaceId(instance, key));
    });
  }

  /**
   * Moves the idle window (#32 calls it on terminal input and output). No Docker call: the tracker knows
   * every workspace this process started or adopted, and an untracked one is not running as far as idle stop
   * is concerned.
   */
  activity(key: WorkspaceKey): void {
    const { tracker, instance } = this.#options;
    const id = workspaceId(instance, key);
    if (!tracker.isTracked(id)) throw new WorkspaceNotRunningError(id);
    tracker.touch(id, key);
  }

  /**
   * Stops every workspace whose idle time is up (design 6.4). Each is re-checked after its lock is taken,
   * because activity may have moved its window while the sweep waited behind an ensure.
   */
  async sweepIdle(): Promise<void> {
    const { tracker, now } = this.#options;
    for (const due of tracker.due(now())) {
      await this.#options.mutex.run(this.lockKey(due.key), async () => {
        const window = tracker.idleOf(due.id);
        if (window === null || now() < window.stopAt) return;
        await this.#idleStop(due.id, due.key);
      });
    }
  }

  /** A failure is logged and the sweep goes on; only Docker being unavailable keeps the entry for a retry. */
  async #idleStop(id: string, key: WorkspaceKey): Promise<void> {
    const { runtime, tracker, log } = this.#options;
    try {
      await runtime.stop(key);
      log.info(`idle stop: ${id}`);
    } catch (error: unknown) {
      const kind = error instanceof Error ? error.constructor.name : typeof error;
      log.warn(`idle stop failed: ${id}: ${kind}`);
      if (error instanceof DockerUnavailableError) return;
    }
    tracker.forget(id);
  }

  #view(info: WorkspaceInfo): WorkspaceView {
    const idle = info.state === "running" ? this.#options.tracker.idleOf(info.id) : null;
    return { ...info, idle };
  }
}
