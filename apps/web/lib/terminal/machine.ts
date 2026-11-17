import type {
  EnvironmentResult,
  LessonStartedResult,
  OpenTerminalResult,
} from "../workspace/environment";
import { chunkInput } from "./chunk";
import {
  ACK_MAX,
  ackFrame,
  CLOSE_CODE,
  inputFrame,
  type OpenSocket,
  parseServerFrame,
  resizeFrame,
  type TerminalSize,
  type TerminalSocket,
} from "./protocol";
import {
  type EnvironmentNote,
  isEnvironmentRunning,
  type TerminalFailure,
  type TerminalStatus,
} from "./state";

// The browser terminal state machine of #32 design 3.6.1 (rows 1-38, rules G1-G6) with Delta 2's page-open rows
// 0a-0h and rule G7. Row numbers in the comments are the design's. It holds no React state: the region feeds it
// events and renders the status it reports.

/** 3.6.1 timers. */
const ATTACH_TIMEOUT_MS = 10_000;
const ACK_DELAY_MS = 100;
const BACKOFF_MS = [1000, 2000, 4000, 8000, 8000] as const;
const RENEW_RETRY_MS = 15_000;
/** `renewInMs` is the deadline minus this margin (lib/terminal/mint.ts), so `renewDeadlineAt` is the deadline. */
const RENEW_MARGIN_MS = 60_000;
const FIT_DEBOUNCE_MS = 100;
/** Design 3.4: a failed `recordLessonStarted` is retried on a later input, at most once per 30 s. */
const STARTED_RETRY_MS = 30_000;

/** The lesson page's server actions, already bound to the course and lesson. */
export interface EnvironmentActions {
  peekEnvironment(): Promise<EnvironmentResult>;
  startEnvironment(): Promise<EnvironmentResult>;
  openTerminal(): Promise<OpenTerminalResult>;
  recordLessonStarted(): Promise<LessonStartedResult>;
  restartEnvironment(): Promise<EnvironmentResult>;
  resetEnvironment(): Promise<EnvironmentResult>;
}

/**
 * The xterm calls the machine makes. There is deliberately no `reset()` or `clear()` (G6): both run at once,
 * ahead of writes still queued, and leave the parser mid-sequence; a new socket's screen starts with an in-band
 * RIS instead.
 */
export interface MachineTerminal {
  write(data: string | Uint8Array, callback?: () => void): void;
  dispose(): void;
}

/** `setTimer` returns the function that cancels the timer. */
export interface MachineClock {
  now(): number;
  setTimer(callback: () => void, ms: number): () => void;
}

export const browserClock: MachineClock = {
  now: () => performance.now(),
  setTimer: (callback, ms) => {
    const id = setTimeout(callback, ms);
    return () => clearTimeout(id);
  },
};

export interface MachineOptions {
  actions: EnvironmentActions;
  terminal: MachineTerminal;
  openSocket: OpenSocket;
  /** The fitted size of the visible frame, or null while it has none. */
  fitSize: () => TerminalSize | null;
  clock: MachineClock;
  /** Dispatches `academy:session-expired` (state.ts `SESSION_EXPIRED_EVENT`). */
  onSessionExpired: () => void;
  onStatus: (status: TerminalStatus) => void;
  /** `TERMINAL_RECONNECT_ATTEMPTS` (N). */
  reconnectAttempts: number;
  /** `ENVIRONMENT_START_SLOW_SECONDS` (Delta 2 section 2.1). */
  startSlowSeconds: number;
}

type StateId =
  | "idle"
  | "ST"
  | "CO"
  | "AP"
  | "RU"
  | "RN"
  | "RC"
  | "TO"
  | "SX"
  | "ES"
  | "SE"
  | "FA"
  | "unmounted";

/** G5: entering one of these drops `current` and clears `backoffTimer`. */
const TERMINAL_STATES: ReadonlySet<StateId> = new Set(["TO", "SX", "ES", "SE", "FA"]);

class TimerSlot {
  #cancel: (() => void) | null = null;
  readonly #clock: MachineClock;

  constructor(clock: MachineClock) {
    this.#clock = clock;
  }

  get isArmed(): boolean {
    return this.#cancel !== null;
  }

  arm(ms: number, callback: () => void): void {
    this.clear();
    this.#cancel = this.#clock.setTimer(() => {
      this.#cancel = null;
      callback();
    }, ms);
  }

  clear(): void {
    this.#cancel?.();
    this.#cancel = null;
  }
}

interface TicketTiming {
  renewInMs: number | null;
  receivedAt: number;
}

/** One socket and its record (3.6.1 "Data"); a dropped entry's later events are ignored (G2). */
interface SocketEntry {
  socket: TerminalSocket | null;
  isClosed: boolean;
  isDropped: boolean;
  /** Binary bytes written to the terminal and not yet acknowledged (G3). */
  processed: number;
  ackTimer: TimerSlot;
  attachTimer: TimerSlot;
  timing: TicketTiming;
}

export class TerminalMachine {
  readonly #options: MachineOptions;
  #state: StateId = "idle";
  #gen = 0;
  #isMounted = false;
  #attempt = 0;
  #current: SocketEntry | null = null;
  #renewal: SocketEntry | null = null;
  #isRenewalRequested = false;
  #oldTakenOver = false;
  #awaitingSnapshot = false;
  /** Row 29: `current` dropped by a lost connection while a renewal is in flight. */
  #isCurrentLost = false;
  #startCopy: "creating" | "starting" = "starting";
  #startedAt = 0;
  #isSlow = false;
  #isMemoryLimit = false;
  #failure: TerminalFailure = { kind: "start-failed" };
  #expiredShown: TerminalStatus = { kind: "connecting" };
  #isStartedRecorded = false;
  #isStartedInFlight = false;
  #startedFailedAt: number | null = null;
  #lastStatus = "";
  /**
   * Set by a start, restart or reset that returned running; emptied by the first status that is not connecting or
   * running, and at the start of the next restart or reset.
   */
  #note: EnvironmentNote | null = null;
  #unmountedStatus: TerminalStatus = { kind: "connecting" };
  readonly #backoffTimer: TimerSlot;
  readonly #renewTimer: TimerSlot;
  readonly #renewRetryTimer: TimerSlot;
  readonly #slowTimer: TimerSlot;
  readonly #fitTimer: TimerSlot;

  constructor(options: MachineOptions) {
    this.#options = options;
    this.#backoffTimer = new TimerSlot(options.clock);
    this.#renewTimer = new TimerSlot(options.clock);
    this.#renewRetryTimer = new TimerSlot(options.clock);
    this.#slowTimer = new TimerSlot(options.clock);
    this.#fitTimer = new TimerSlot(options.clock);
  }

  get status(): TerminalStatus {
    switch (this.#state) {
      case "idle":
      case "ST":
        return {
          kind: "starting",
          copy: this.#startCopy,
          startedAt: this.#startedAt,
          isSlow: this.#isSlow,
        };
      case "CO":
      case "AP":
        return this.#note === null
          ? { kind: "connecting" }
          : { kind: "connecting", note: this.#note };
      case "RU":
        return this.#runningStatus();
      case "RN":
        return this.#isCurrentLost ? { kind: "reconnecting" } : this.#runningStatus();
      case "RC":
        return { kind: "reconnecting" };
      case "TO":
        return { kind: "taken-over" };
      case "SX":
        return { kind: "shell-exited" };
      case "ES":
        return { kind: "stopped", isMemoryLimit: this.#isMemoryLimit };
      case "FA":
        return { kind: "failed", failure: this.#failure };
      case "SE":
        return { kind: "session-expired", shown: this.#expiredShown };
      case "unmounted":
        return this.#unmountedStatus;
    }
  }

  #runningStatus(): TerminalStatus {
    return this.#note === null ? { kind: "running" } : { kind: "running", note: this.#note };
  }

  /** Row 0a. */
  mount(): void {
    if (this.#state !== "idle") return;
    this.#isMounted = true;
    this.#enterStarting();
    this.#peek();
  }

  /** Row 38. */
  unmount(): void {
    if (!this.#isMounted) return;
    this.#unmountedStatus = this.status;
    this.#isMounted = false;
    this.#gen += 1;
    this.#drop(this.#current);
    this.#drop(this.#renewal);
    this.#current = null;
    this.#renewal = null;
    for (const timer of [
      this.#backoffTimer,
      this.#renewTimer,
      this.#renewRetryTimer,
      this.#slowTimer,
      this.#fitTimer,
    ])
      timer.clear();
    this.#state = "unmounted";
    this.#options.terminal.dispose();
  }

  /** Rows 12, 30, 32: terminal data (xterm's `onData`) goes out only while the shell can take it. */
  input(data: string): void {
    const current = this.#current;
    if (current === null || !this.#canSendInput()) return;
    for (const chunk of chunkInput(data)) this.#send(current, inputFrame(chunk));
  }

  /**
   * A key the terminal passes to the shell, or a paste (design 3.4): the first one on this page that is sent
   * records the lesson as started. xterm's automatic replies arrive through `input` only and never count.
   */
  userInput(): void {
    if (!this.#canSendInput()) return;
    this.#recordStarted();
  }

  /** Row 13: the fitted size changed; the resize goes out 100 ms after the last change. */
  fitChanged(): void {
    if (!this.#isMounted) return;
    this.#fitTimer.arm(FIT_DEBOUNCE_MS, () => {
      const current = this.#current;
      const isRunning = this.#state === "RU" || this.#state === "RN";
      if (!isRunning || current === null || current.isClosed || this.#awaitingSnapshot) return;
      this.#sendResize(current);
    });
  }

  /** Rows 33-36: the status action of TO, SX, ES and FA (open here, open a new session, start again, retry). */
  act(): void {
    if (!this.#isMounted) return;
    const state = this.#state;
    if (state === "TO" || state === "SX") {
      this.#attempt = 0;
      this.#openTerminal();
    } else if (state === "ES") {
      this.#restart();
    } else if (state === "FA") {
      const failure = this.#failure.kind;
      if (failure === "reconnect-failed") {
        this.#attempt = 0;
        this.#openTerminal();
      } else if (failure !== "rejected") {
        this.#restart();
      }
      // Rejected's action (open the course) is a link and leaves the machine.
    }
  }

  /** The menu's restart: stop and start the container; the files stay. */
  restart(): void {
    this.#maintain("starting", () => this.#options.actions.restartEnvironment(), false);
  }

  /** The menu's reset: create the workspace again from the lesson's starter. */
  reset(): void {
    this.#maintain("creating", () => this.#options.actions.resetEnvironment(), true);
  }

  // --- state changes -------------------------------------------------------------------------------------

  /**
   * Every state change bumps `gen` (G1). G1 lists the rows that must; the remaining changes (rows 0a, 1, 6, 6a,
   * 18, 21 and 27 to RU, 22, 24, 31) leave no call in flight, so bumping them too drops nothing, and a call is
   * always issued after its row's change, so it captures the new `gen`.
   */
  #setState(next: StateId): void {
    const previous = this.#state;
    if (previous === next) return;
    this.#gen += 1;
    if (previous === "ST") {
      // G7.
      this.#slowTimer.clear();
      this.#isSlow = false;
    }
    const isRunning = (state: StateId): boolean => state === "RU" || state === "RN";
    if (isRunning(previous) && !isRunning(next)) {
      // G4.
      this.#renewTimer.clear();
      this.#renewRetryTimer.clear();
      this.#drop(this.#renewal);
      this.#renewal = null;
      this.#isRenewalRequested = false;
    }
    if (previous === "RN") this.#isCurrentLost = false;
    if (TERMINAL_STATES.has(next)) {
      // G5; A5-N3 clears `awaitingSnapshot` here too.
      this.#backoffTimer.clear();
      this.#drop(this.#current);
      this.#current = null;
      this.#awaitingSnapshot = false;
    }
    this.#state = next;
  }

  #emit(): void {
    const status = this.status;
    if (status.kind !== "connecting" && status.kind !== "running") this.#note = null;
    const serialized = JSON.stringify(status);
    if (serialized === this.#lastStatus) return;
    this.#lastStatus = serialized;
    this.#options.onStatus(status);
  }

  #enterStarting(copy: "creating" | "starting" = "starting"): void {
    this.#setState("ST");
    this.#startCopy = copy;
    this.#startedAt = this.#options.clock.now();
    this.#isSlow = false;
    // Row 0h.
    this.#slowTimer.arm(this.#options.startSlowSeconds * 1000, () => {
      if (this.#state !== "ST") return;
      this.#isSlow = true;
      this.#emit();
    });
    this.#emit();
  }

  #enterSessionExpired(): void {
    const shown = this.status;
    this.#expiredShown = shown.kind === "session-expired" ? shown.shown : shown;
    this.#setState("SE");
    this.#options.onSessionExpired();
    this.#emit();
  }

  /** ES; a stop seen as a close code is refined by a peek for the memory-limit copy (rows 7, 15). */
  #enterStopped(isMemoryLimit: boolean, shouldPeek: boolean): void {
    this.#setState("ES");
    this.#isMemoryLimit = isMemoryLimit;
    this.#emit();
    if (!shouldPeek) return;
    this.#call(
      () => this.#options.actions.peekEnvironment(),
      (result) => {
        if (result.kind !== "limits") return;
        this.#isMemoryLimit = true;
        this.#emit();
      },
      () => undefined,
    );
  }

  #enterFailed(failure: TerminalFailure): void {
    this.#setState("FA");
    this.#failure = failure;
    this.#emit();
  }

  #enterReconnecting(): void {
    this.#setState("RC");
    const delay = BACKOFF_MS[Math.min(this.#attempt, BACKOFF_MS.length) - 1] ?? BACKOFF_MS[0];
    // Row 31.
    this.#backoffTimer.arm(delay, () => {
      if (this.#state === "RC") this.#openTerminal();
    });
    this.#emit();
  }

  /** Rows 5 and 9: retry while attempts remain, else "reconnect failed". */
  #retryOrFail(): void {
    if (this.#attempt < this.#options.reconnectAttempts) {
      this.#attempt += 1;
      this.#enterReconnecting();
    } else {
      this.#enterFailed({ kind: "reconnect-failed" });
    }
  }

  /** The close codes that end the connection for good: rows 7-8, 14-16, 26, 28. */
  #endByCode(code: number): boolean {
    if (code === CLOSE_CODE.shellExited) {
      this.#setState("SX");
      this.#emit();
      return true;
    }
    if (code === CLOSE_CODE.environmentStopped) {
      this.#enterStopped(false, true);
      return true;
    }
    if (code === CLOSE_CODE.takenOver) {
      this.#setState("TO");
      this.#emit();
      return true;
    }
    return false;
  }

  // --- calls (G1) ----------------------------------------------------------------------------------------

  /** G1: a result is applied only while `gen` is the one captured at the call and the machine is mounted. */
  #call<T>(start: () => Promise<T>, onResult: (result: T) => void, onReject: () => void): void {
    const gen = this.#gen;
    const isCurrent = (): boolean => this.#isMounted && gen === this.#gen;
    start().then(
      (result) => {
        if (isCurrent()) onResult(result);
      },
      () => {
        if (isCurrent()) onReject();
      },
    );
  }

  /** Rows 0a-0f: the peek on page open. */
  #peek(): void {
    this.#call(
      () => this.#options.actions.peekEnvironment(),
      (result) => {
        switch (result.kind) {
          case "running":
            this.#openTerminal();
            return;
          case "absent":
            this.#startCopy = "creating";
            this.#startInPlace();
            return;
          case "stopped":
          case "limits":
            this.#startCopy = "starting";
            this.#startInPlace();
            return;
          default:
            this.#onStartFailure(result);
        }
      },
      () => this.#enterFailed({ kind: "start-failed" }),
    );
  }

  /** Rows 0c and 0d stay in ST: the timer and the slow note keep counting from the page open. */
  #startInPlace(): void {
    this.#gen += 1;
    this.#emit();
    this.#start();
  }

  /** Rows 35 and 36: start again, or retry after an environment failure. */
  #restart(): void {
    this.#attempt = 0;
    this.#enterStarting();
    this.#start();
  }

  /**
   * Restart and reset. After `unmount()` the status getter returns the last mounted status, which can read
   * running, so the mount is checked first. The connection is dropped before the call: the service's stop then
   * closes a socket the machine already ignores (G2), so its 4002 cannot show "stopped" in between.
   */
  #maintain(
    copy: "creating" | "starting",
    call: () => Promise<EnvironmentResult>,
    isReset: boolean,
  ): void {
    if (!this.#isMounted || !isEnvironmentRunning(this.status)) return;
    this.#releaseConnection();
    this.#note = null;
    this.#attempt = 0;
    this.#enterStarting(copy);
    this.#call(
      call,
      (result) => {
        if (result.kind !== "running") {
          this.#onStartFailure(result);
          return;
        }
        this.#attempt = 0;
        this.#note = isReset ? "workspace-reset" : recreatedNote(result);
        this.#openTerminal();
      },
      () => this.#enterFailed({ kind: "start-failed" }),
    );
  }

  #releaseConnection(): void {
    this.#drop(this.#current);
    this.#current = null;
    this.#backoffTimer.clear();
    this.#awaitingSnapshot = false;
    this.#isCurrentLost = false;
  }

  /** Rows 0e-0g. */
  #start(): void {
    this.#call(
      () => this.#options.actions.startEnvironment(),
      (result) => {
        if (result.kind === "running") {
          this.#attempt = 0;
          this.#note = recreatedNote(result);
          this.#openTerminal();
          return;
        }
        this.#onStartFailure(result);
      },
      () => this.#enterFailed({ kind: "start-failed" }),
    );
  }

  /** Rows 0e and 0f. A start that answers anything but running is a failed start. */
  #onStartFailure(result: EnvironmentResult): void {
    if (result.kind === "unauthenticated") {
      this.#enterSessionExpired();
      return;
    }
    this.#enterFailed(failureOf(result));
  }

  /** Rows 1-5 (and 31, 33, 34, 36). */
  #openTerminal(): void {
    this.#setState("CO");
    this.#emit();
    this.#call(
      () => this.#options.actions.openTerminal(),
      (result) => {
        if (result.kind === "ticket") {
          // Row 1.
          this.#drop(this.#current);
          this.#awaitingSnapshot = false;
          const entry = this.#openEntry(result.ticket, result.renewInMs);
          this.#current = entry;
          entry.attachTimer.arm(ATTACH_TIMEOUT_MS, () => this.#onAttachTimeout(entry));
          this.#setState("AP");
          this.#emit();
          return;
        }
        if (result.kind === "unauthenticated") this.#enterSessionExpired();
        else if (result.kind === "stopped" || result.kind === "limits")
          this.#enterStopped(result.kind === "limits", false);
        else this.#enterFailed(failureOf(result));
      },
      () => this.#retryOrFail(),
    );
  }

  /** Rows 18 and 22. */
  #renew(): void {
    if (this.#state !== "RU" || this.#awaitingSnapshot) return;
    this.#setState("RN");
    this.#isRenewalRequested = true;
    this.#emit();
    this.#call(
      () => this.#options.actions.openTerminal(),
      (result) => {
        this.#isRenewalRequested = false;
        if (result.kind === "ticket") {
          // Row 19.
          const entry = this.#openEntry(result.ticket, result.renewInMs);
          this.#renewal = entry;
          entry.attachTimer.arm(ATTACH_TIMEOUT_MS, () => this.#onAttachTimeout(entry));
          return;
        }
        // Row 20, else row 21.
        if (result.kind === "unauthenticated") this.#enterSessionExpired();
        else this.#renewalFailed(false);
      },
      () => {
        this.#isRenewalRequested = false;
        this.#renewalFailed(false);
      },
    );
  }

  /** Rows 21 and 27 after the renewal is gone. */
  #renewalFailed(isOldTakenOver: boolean): void {
    const current = this.#current;
    if (isOldTakenOver || current === null || current.isClosed) {
      this.#drop(current);
      this.#current = null;
      this.#attempt = 1;
      this.#enterReconnecting();
      return;
    }
    this.#setState("RU");
    if (this.#options.clock.now() + RENEW_RETRY_MS < renewDeadlineAt(current.timing))
      this.#renewRetryTimer.arm(RENEW_RETRY_MS, () => this.#renew());
    this.#emit();
  }

  #armRenewTimer(timing: TicketTiming): void {
    if (timing.renewInMs === null) return;
    const elapsed = this.#options.clock.now() - timing.receivedAt;
    this.#renewTimer.arm(Math.max(timing.renewInMs - elapsed, 0), () => this.#renew());
  }

  // --- sockets -------------------------------------------------------------------------------------------

  #openEntry(ticket: string, renewInMs: number | null): SocketEntry {
    const entry: SocketEntry = {
      socket: null,
      isClosed: false,
      isDropped: false,
      processed: 0,
      ackTimer: new TimerSlot(this.#options.clock),
      attachTimer: new TimerSlot(this.#options.clock),
      timing: { renewInMs, receivedAt: this.#options.clock.now() },
    };
    entry.socket = this.#options.openSocket(ticket, {
      onText: (text) => {
        if (!entry.isDropped) this.#onText(entry, text);
      },
      onBinary: (bytes) => {
        if (!entry.isDropped) this.#onBinary(entry, bytes);
      },
      onClose: (code) => {
        if (entry.isDropped) return;
        entry.isClosed = true;
        this.#onClose(entry, code);
      },
    });
    return entry;
  }

  /** G2: closes the socket if open, clears its timers and discards its record; later events are ignored. */
  #drop(entry: SocketEntry | null): void {
    if (entry === null || entry.isDropped) return;
    entry.isDropped = true;
    entry.attachTimer.clear();
    entry.ackTimer.clear();
    entry.processed = 0;
    if (!entry.isClosed) {
      entry.isClosed = true;
      entry.socket?.close();
    }
  }

  #send(entry: SocketEntry, text: string): void {
    if (entry.isClosed) return;
    entry.socket?.send(text);
  }

  #sendResize(entry: SocketEntry): void {
    const size = this.#options.fitSize();
    if (size !== null) this.#send(entry, resizeFrame(size));
  }

  /** G6: RIS as bytes, so a UTF-8 sequence cut in the previous socket's output is discarded with it (A5-N2). */
  #writeReset(): void {
    this.#options.terminal.write(Uint8Array.of(0x1b, 0x63));
  }

  #onText(entry: SocketEntry, text: string): void {
    const frame = parseServerFrame(text);
    if (frame === null) return;
    if (frame.t === "attached") {
      if (entry === this.#current && this.#state === "AP") this.#attached(entry, frame.resumed);
      else if (entry === this.#renewal && this.#state === "RN")
        this.#renewalAttached(entry, frame.resumed);
      return;
    }
    // Row 6b; a snapshot on another socket or while none is awaited is ignored (A5-N6).
    if (entry !== this.#current || this.#state !== "RU" || !this.#awaitingSnapshot) return;
    this.#options.terminal.write(frame.d);
    this.#awaitingSnapshot = false;
    entry.attachTimer.clear();
    this.#sendResize(entry);
  }

  /** Rows 6 and 6a. */
  #attached(entry: SocketEntry, isResumed: boolean): void {
    this.#writeReset();
    if (isResumed) {
      this.#awaitingSnapshot = true;
    } else {
      entry.attachTimer.clear();
      this.#sendResize(entry);
    }
    this.#attempt = 0;
    this.#armRenewTimer(entry.timing);
    this.#setState("RU");
    this.#emit();
  }

  /** Rows 24 and 24a. */
  #renewalAttached(entry: SocketEntry, isResumed: boolean): void {
    this.#drop(this.#current);
    this.#current = entry;
    this.#renewal = null;
    this.#oldTakenOver = false;
    this.#isCurrentLost = false;
    this.#writeReset();
    if (isResumed) {
      this.#awaitingSnapshot = true;
    } else {
      entry.attachTimer.clear();
      this.#sendResize(entry);
    }
    this.#armRenewTimer(entry.timing);
    this.#setState("RU");
    this.#emit();
  }

  /** Row 10 and G3. */
  #onBinary(entry: SocketEntry, bytes: Uint8Array): void {
    const isRunning = this.#state === "RU" || this.#state === "RN";
    if (entry !== this.#current || !isRunning || entry.isClosed) return;
    this.#options.terminal.write(bytes, () => {
      if (entry !== this.#current || entry.isClosed || entry.isDropped) return;
      entry.processed += bytes.length;
      if (!entry.ackTimer.isArmed) entry.ackTimer.arm(ACK_DELAY_MS, () => this.#sendAck(entry));
    });
  }

  /** Row 11. */
  #sendAck(entry: SocketEntry): void {
    if (entry !== this.#current || entry.isClosed) return;
    while (entry.processed > 0) {
      const n = Math.min(entry.processed, ACK_MAX);
      this.#send(entry, ackFrame(n));
      entry.processed -= n;
    }
  }

  #onAttachTimeout(entry: SocketEntry): void {
    if (entry === this.#renewal && this.#state === "RN") {
      this.#renewalClosedOrFailed(entry);
      return;
    }
    if (entry !== this.#current) return;
    if (this.#state === "AP") this.#currentFailedInAttach(entry);
    else if (this.#state === "RU" && this.#awaitingSnapshot) this.#currentLostInRunning(entry);
  }

  #onClose(entry: SocketEntry, code: number): void {
    if (entry === this.#renewal && this.#state === "RN") {
      // Rows 25 and 26, else 27.
      if (!this.#endByCode(code)) this.#renewalClosedOrFailed(entry);
      return;
    }
    if (entry !== this.#current) return;
    switch (this.#state) {
      case "AP":
        // Rows 7 and 8, else 9.
        if (!this.#endByCode(code)) this.#currentFailedInAttach(entry);
        return;
      case "RU":
        // Rows 14-16, else 17.
        if (!this.#endByCode(code)) this.#currentLostInRunning(entry);
        return;
      case "RN":
        this.#currentClosedInRenewal(entry, code);
        return;
      default:
        return;
    }
  }

  /** Row 9. */
  #currentFailedInAttach(entry: SocketEntry): void {
    this.#drop(entry);
    this.#current = null;
    this.#retryOrFail();
  }

  /** Row 17. */
  #currentLostInRunning(entry: SocketEntry): void {
    this.#drop(entry);
    this.#current = null;
    this.#awaitingSnapshot = false;
    this.#attempt = 1;
    this.#enterReconnecting();
  }

  /** Row 27. */
  #renewalClosedOrFailed(entry: SocketEntry): void {
    this.#drop(entry);
    this.#renewal = null;
    this.#renewalFailed(this.#oldTakenOver);
  }

  /** Rows 23, 23a, 28, 29 and 29a. */
  #currentClosedInRenewal(entry: SocketEntry, code: number): void {
    const hasRenewalSocket = this.#renewal !== null;
    const isRenewalInFlight = hasRenewalSocket || this.#isRenewalRequested;
    if (code === CLOSE_CODE.shellExited || code === CLOSE_CODE.environmentStopped) {
      this.#endByCode(code);
      return;
    }
    if (code === CLOSE_CODE.takenOver && hasRenewalSocket) {
      // Row 23: our own renewal (or race R-race) replaced it; the switch happens at the renewal's `attached`.
      this.#oldTakenOver = true;
      this.#drop(entry);
      return;
    }
    if (code === CLOSE_CODE.takenOver) {
      // Row 23a, and row 29a's row 16: a real takeover; the renewal result is dropped by G1.
      this.#endByCode(code);
      return;
    }
    if (isRenewalInFlight) {
      // Row 29: keep `current` as closed; the renewal's `attached` switches, its failure goes to RC.
      this.#drop(entry);
      this.#isCurrentLost = true;
      this.#emit();
      return;
    }
    // Row 29a, as row 17. Unreachable today: RN without a renewal request or socket is left by rows 19-21 before
    // any close can arrive. Kept so that a future change to those rows cannot leave the terminal stuck in RN
    // with no timer and no action.
    this.#currentLostInRunning(entry);
  }

  // --- input bookkeeping ---------------------------------------------------------------------------------

  /** Row 12 (RU, not awaiting the snapshot) and row 30 (RN with `current` open); row 32 otherwise. */
  #canSendInput(): boolean {
    const current = this.#current;
    if (current === null || current.isClosed) return false;
    if (this.#state === "RU") return !this.#awaitingSnapshot;
    return this.#state === "RN";
  }

  /** Design 3.4; guarded by `mounted` only (G1), since its result touches only this bookkeeping. */
  #recordStarted(): void {
    if (this.#isStartedRecorded || this.#isStartedInFlight) return;
    const now = this.#options.clock.now();
    if (this.#startedFailedAt !== null && now - this.#startedFailedAt < STARTED_RETRY_MS) return;
    this.#isStartedInFlight = true;
    const settle = (isRecorded: boolean): void => {
      if (!this.#isMounted) return;
      this.#isStartedInFlight = false;
      if (isRecorded) this.#isStartedRecorded = true;
      else this.#startedFailedAt = this.#options.clock.now();
    };
    this.#options.actions.recordLessonStarted().then(
      (result) => settle(result.kind === "recorded"),
      () => settle(false),
    );
  }
}

function recreatedNote(
  result: Extract<EnvironmentResult, { kind: "running" }>,
): EnvironmentNote | null {
  return result.isVolumeRecreated ? "volume-recreated" : null;
}

function renewDeadlineAt(timing: TicketTiming): number {
  if (timing.renewInMs === null) return Number.NEGATIVE_INFINITY;
  return timing.receivedAt + timing.renewInMs + RENEW_MARGIN_MS;
}

/** Row 4 and 0f: each service failure keeps its copy; anything else is a failed start. */
function failureOf(result: EnvironmentResult | OpenTerminalResult): TerminalFailure {
  switch (result.kind) {
    case "docker-down":
      return { kind: "docker-down" };
    case "image-missing":
      return { kind: "image-missing", image: result.image };
    case "rejected":
      return { kind: "rejected" };
    default:
      return { kind: "start-failed" };
  }
}
