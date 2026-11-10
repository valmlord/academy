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

/**
 * The terminal registry's view of a stop (design 3.2.1 rows 22 and 23): told before the runtime call, so the
 * exec end that follows reads as the environment stopping, and told again if that call throws.
 */
export interface StopHooks {
  onStopping(id: string): void;
  onStopRejected(id: string): void;
}

const NO_STOP_HOOKS: StopHooks = { onStopping: () => undefined, onStopRejected: () => undefined };

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
  /** The terminal registry (#32); none when no terminal runs, as in the manager's own tests. */
  stopHooks?: StopHooks;
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

  /**
   * The lock is taken before the course read, so a stop or delete that arrives later on the same key waits
   * for this ensure instead of overtaking it during the read (ADR-0010 item 8).
   */
  async ensure(key: WorkspaceKey): Promise<EnsureView> {
    const { runtime, readCourse, imageOverride, tracker, mutex } = this.#options;
    return mutex.run(this.lockKey(key), async () => {
      const lesson = (await readCourse()).lesson(key.courseId, key.lessonId);
      if (lesson.workspace === null) {
        throw new LessonHasNoWorkspaceError(key.courseId, key.lessonId);
      }
      const { image, starter } = lesson.workspace;
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
    const { runtime, tracker, mutex, instance } = this.#options;
    return mutex.run(this.lockKey(key), async () => {
      const info = await this.#stopping(workspaceId(instance, key), () => runtime.stop(key));
      tracker.forget(info.id);
      return this.#view(info);
    });
  }

  async remove(key: WorkspaceKey): Promise<void> {
    const { runtime, tracker, mutex, instance } = this.#options;
    await mutex.run(this.lockKey(key), async () => {
      const id = workspaceId(instance, key);
      await this.#stopping(id, () => runtime.remove(key));
      tracker.forget(id);
    });
  }

  /**
   * `POST W/activity`: moves the idle window (#34 calls it at the start and the end of a check; terminal
   * traffic goes through `touchFromTerminal`). No Docker call: the tracker knows every workspace this process
   * started or adopted, and an untracked one is not running as far as idle stop is concerned.
   */
  activity(key: WorkspaceKey): void {
    const { tracker, instance } = this.#options;
    const id = workspaceId(instance, key);
    if (!tracker.isTracked(id)) throw new WorkspaceNotRunningError(id);
    tracker.touch(id, key);
  }

  /**
   * Terminal activity (design 3.4, ADR-0010 item 9 amended): input, resize, and output while a browser is
   * attached. A workspace the tracker does not know (after a restart, before reconcile adopts it) is ignored.
   */
  touchFromTerminal(key: WorkspaceKey): void {
    const { tracker, instance } = this.#options;
    const id = workspaceId(instance, key);
    if (tracker.isTracked(id)) tracker.touch(id, key);
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
      await this.#stopping(id, () => runtime.stop(key));
      log.info(`idle stop: ${id}`);
    } catch (error: unknown) {
      const kind = error instanceof Error ? error.constructor.name : typeof error;
      log.warn(`idle stop failed: ${id}: ${kind}`);
      if (error instanceof DockerUnavailableError) return;
    }
    tracker.forget(id);
  }

  /** A runtime call that stops the workspace's container, with the terminal told before and on failure. */
  async #stopping<T>(id: string, stopCall: () => Promise<T>): Promise<T> {
    const hooks = this.#options.stopHooks ?? NO_STOP_HOOKS;
    hooks.onStopping(id);
    try {
      return await stopCall();
    } catch (error: unknown) {
      hooks.onStopRejected(id);
      throw error;
    }
  }

  #view(info: WorkspaceInfo): WorkspaceView {
    const idle = info.state === "running" ? this.#options.tracker.idleOf(info.id) : null;
    return { ...info, idle };
  }
}
