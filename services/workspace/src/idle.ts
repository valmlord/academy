import type { WorkspaceKey } from "./identity.js";

const MS_PER_MINUTE = 60_000;

/** When a running workspace will be stopped for inactivity, and when the learner is warned (epoch ms). */
export interface IdleWindow {
  stopAt: number;
  warningAt: number;
}

export interface DueWorkspace {
  id: string;
  key: WorkspaceKey;
}

export interface IdleTrackerOptions {
  stopMinutes: number;
  warningMinutes: number;
  /** Injected so tests control time; the service passes `Date.now`. */
  now: () => number;
}

interface Entry {
  key: WorkspaceKey;
  lastActivity: number;
}

/**
 * In-memory idle timers by workspace id (design 6.4). The key is stored with the time so the idle stop can
 * go through the keyed, label-checked stop. Nothing is persisted: reconcile re-seeds it after a restart.
 */
export class IdleTracker {
  readonly #entries = new Map<string, Entry>();
  readonly #stopMs: number;
  readonly #warningMs: number;
  readonly #now: () => number;

  constructor(options: IdleTrackerOptions) {
    this.#stopMs = options.stopMinutes * MS_PER_MINUTE;
    this.#warningMs = options.warningMinutes * MS_PER_MINUTE;
    this.#now = options.now;
  }

  /** Records activity now; a later touch always moves the window. */
  touch(id: string, key: WorkspaceKey): void {
    this.#entries.set(id, { key, lastActivity: this.#now() });
  }

  forget(id: string): void {
    this.#entries.delete(id);
  }

  isTracked(id: string): boolean {
    return this.#entries.has(id);
  }

  idleOf(id: string): IdleWindow | null {
    const entry = this.#entries.get(id);
    if (entry === undefined) return null;
    const stopAt = entry.lastActivity + this.#stopMs;
    return { stopAt, warningAt: stopAt - this.#warningMs };
  }

  /** Every tracked workspace whose stop time has been reached at `now`. */
  due(now: number): DueWorkspace[] {
    const result: DueWorkspace[] = [];
    for (const [id, entry] of this.#entries) {
      if (now >= entry.lastActivity + this.#stopMs) result.push({ id, key: entry.key });
    }
    return result;
  }
}
