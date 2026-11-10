import type { MachineClock } from "../terminal/machine";
// Types only: environment.ts imports server modules, and a type import is erased from the client bundle.
import type { ActivityResult, IdleResult } from "../workspace/environment";

// The idle warning's schedule (#106 design 5, F10.1, F10.2). No push channel exists, so the watcher reads the
// service's idle times while the environment runs and sleeps until the predicted warning: the idle window only
// moves later (ADR-0010 item 9 as amended), so a read at the predicted time either confirms it or finds a later
// one. Reads never record activity, or polling would keep an idle environment alive.

/** The lesson page's idle server actions, already bound to the course and lesson. */
export interface IdleActions {
  readEnvironmentIdle(): Promise<IdleResult>;
  recordEnvironmentActivity(): Promise<ActivityResult>;
}

export interface IdleWatcherOptions {
  actions: IdleActions;
  clock: MachineClock;
  /** The warning's minutes while it shows, `null` when it goes. Called only when that changes. */
  onWarning: (minutes: number | null) => void;
  onSessionExpired: () => void;
}

/** No read sooner than this after a predicted time, so a clock at the boundary cannot spin. */
const MIN_READ_MS = 1000;
/**
 * The longest sleep: it bounds the one case where the window moves earlier, a service restarted with a shorter
 * `ENVIRONMENT_IDLE_STOP_MINUTES`.
 */
const MAX_READ_MS = 5 * 60_000;
/** While the warning shows: output of an agent moves the window, and this read clears the warning then. */
const WARNING_READ_MS = 30_000;
/** A running workspace the service's idle tracker has not adopted yet. */
const UNTRACKED_READ_MS = 60_000;
/** The first wait after a failed read; it doubles per consecutive failure up to `MAX_READ_MS`. */
const FAILED_READ_MS = 30_000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export class IdleWatcher {
  readonly #options: IdleWatcherOptions;
  /** Bumped by every cancel, so a read or activity answer that arrives later is ignored. */
  #gen = 0;
  #cancelTimer: (() => void) | null = null;
  #isStarted = false;
  #isStopped = false;
  #isHidden = false;
  #shownMinutes: number | null = null;
  #failures = 0;

  constructor(options: IdleWatcherOptions) {
    this.#options = options;
  }

  /** A hidden tab arms nothing: no `visibilitychange` fires for a tab that was already hidden at the start. */
  start({ isHidden }: { isHidden: boolean }): void {
    if (this.#isStarted) return;
    this.#isStarted = true;
    this.#isHidden = isHidden;
    if (!isHidden) this.#read();
  }

  stop(): void {
    if (this.#isStopped) return;
    this.#isStopped = true;
    this.#cancel();
    this.#show(null);
  }

  /** No reads in a hidden tab; the first read after it shows again happens at once. */
  setHidden(isHidden: boolean): void {
    if (!this.#isStarted || this.#isStopped) return;
    this.#isHidden = isHidden;
    this.#cancel();
    if (!isHidden) this.#read();
  }

  /** "Continue working": the warning goes at once, the window moves, then the schedule is read again. */
  continue(): void {
    if (!this.#isStarted || this.#isStopped) return;
    this.#cancel();
    this.#show(null);
    const gen = this.#gen;
    const readAgain = (): void => {
      if (gen === this.#gen && !this.#isHidden) this.#read();
    };
    // A failed or rejected activity call still ends in a read: the read shows what the service now holds.
    this.#options.actions.recordEnvironmentActivity().then(readAgain, readAgain);
  }

  #cancel(): void {
    this.#gen += 1;
    this.#cancelTimer?.();
    this.#cancelTimer = null;
  }

  #show(minutes: number | null): void {
    if (minutes === this.#shownMinutes) return;
    this.#shownMinutes = minutes;
    this.#options.onWarning(minutes);
  }

  #schedule(ms: number): void {
    this.#cancelTimer?.();
    this.#cancelTimer = this.#options.clock.setTimer(() => {
      this.#cancelTimer = null;
      this.#read();
    }, ms);
  }

  #read(): void {
    const gen = this.#gen;
    this.#options.actions.readEnvironmentIdle().then(
      (result) => {
        if (gen === this.#gen) this.#apply(result);
      },
      // A rejection (a failed session read or request) is a failed read: handled here, never unhandled.
      () => {
        if (gen === this.#gen) this.#failed();
      },
    );
  }

  #apply(result: IdleResult): void {
    switch (result.kind) {
      case "idle":
        this.#failures = 0;
        if (result.warnInMs > 0) {
          this.#show(null);
          this.#schedule(clamp(result.warnInMs, MIN_READ_MS, MAX_READ_MS));
        } else {
          this.#show(result.warningMinutes);
          this.#schedule(Math.min(WARNING_READ_MS, Math.max(result.stopInMs, MIN_READ_MS)));
        }
        return;
      case "none":
        this.#failures = 0;
        this.#show(null);
        this.#schedule(UNTRACKED_READ_MS);
        return;
      case "failed":
        this.#failed();
        return;
      case "unauthenticated":
        this.#options.onSessionExpired();
        this.stop();
        return;
    }
  }

  /** Keeps what shows and backs off: 30 s, 60 s, 120 s, then the 5 min cap. */
  #failed(): void {
    this.#failures += 1;
    this.#schedule(Math.min(FAILED_READ_MS * 2 ** (this.#failures - 1), MAX_READ_MS));
  }
}
