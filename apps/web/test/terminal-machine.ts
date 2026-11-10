import { vi } from "vitest";
import { type MachineOptions, TerminalMachine } from "@/lib/terminal/machine";
import type { SocketHandlers, TerminalSize, TerminalSocket } from "@/lib/terminal/protocol";
import type { TerminalStatus } from "@/lib/terminal/state";
import type {
  EnvironmentResult,
  LessonStartedResult,
  OpenTerminalResult,
} from "@/lib/workspace/environment";

// U-machine support (design 10.3): fake sockets that record what the machine sends, a fake terminal that records
// every write, reset, clear and dispose in one ordered log and whose write callbacks the test fires by hand, and
// server actions whose answers the test gives one call at a time. Timers are vitest's fake timers; the clock
// reads the faked `Date`.

export const T0 = Date.parse("2026-11-04T12:00:00Z");
export const RIS = "RIS";

export class Deferred<T> {
  resolve: (value: T) => void = () => undefined;
  reject: (reason: unknown) => void = () => undefined;
  readonly promise = new Promise<T>((resolve, reject) => {
    this.resolve = resolve;
    this.reject = reject;
  });
}

export type TerminalCall =
  | { op: "write"; data: string }
  | { op: "reset" }
  | { op: "clear" }
  | { op: "dispose" };

/**
 * Writes are logged by content: a string as itself, the bytes ESC c as `RIS`, other bytes as `bytes:<text>`.
 * `reset` and `clear` exist only so a mutant that calls them is logged; the machine's type has neither.
 */
export class FakeTerminal {
  readonly log: TerminalCall[] = [];
  readonly #callbacks: (() => void)[] = [];

  write(data: string | Uint8Array, callback?: () => void): void {
    this.log.push({ op: "write", data: describe(data) });
    if (callback !== undefined) this.#callbacks.push(callback);
  }

  reset(): void {
    this.log.push({ op: "reset" });
  }

  clear(): void {
    this.log.push({ op: "clear" });
  }

  dispose(): void {
    this.log.push({ op: "dispose" });
  }

  /** Fires every pending write callback, as xterm does once it parsed the bytes. */
  parse(): void {
    for (const callback of this.#callbacks.splice(0)) callback();
  }

  writes(): string[] {
    return this.log.flatMap((call) => (call.op === "write" ? [call.data] : []));
  }
}

function describe(data: string | Uint8Array): string {
  if (typeof data === "string") return data;
  if (data.length === 2 && data[0] === 0x1b && data[1] === 0x63) return RIS;
  return `bytes:${new TextDecoder().decode(data)}`;
}

export class FakeSocket implements TerminalSocket {
  readonly sent: string[] = [];
  closeCalls = 0;
  readonly ticket: string;
  readonly #handlers: SocketHandlers;

  constructor(ticket: string, handlers: SocketHandlers) {
    this.ticket = ticket;
    this.#handlers = handlers;
  }

  send(text: string): void {
    this.sent.push(text);
  }

  close(): void {
    this.closeCalls += 1;
  }

  /** The parsed frames the machine sent, in order. */
  frames(): unknown[] {
    return this.sent.map((text) => JSON.parse(text));
  }

  attached(resumed: boolean): void {
    this.#handlers.onText(JSON.stringify({ t: "attached", resumed }));
  }

  snapshot(text: string): void {
    this.#handlers.onText(JSON.stringify({ t: "snapshot", d: text }));
  }

  output(text: string): void {
    this.#handlers.onBinary(new TextEncoder().encode(text));
  }

  closedBy(code: number): void {
    this.#handlers.onClose(code);
  }
}

export interface Harness {
  machine: TerminalMachine;
  terminal: FakeTerminal;
  sockets: FakeSocket[];
  peeks: Deferred<EnvironmentResult>[];
  starts: Deferred<EnvironmentResult>[];
  opens: Deferred<OpenTerminalResult>[];
  records: Deferred<LessonStartedResult>[];
  statuses: TerminalStatus[];
  sessionExpired: ReturnType<typeof vi.fn>;
  size: TerminalSize;
  lastSocket(): FakeSocket;
  lastOpen(): Deferred<OpenTerminalResult>;
  status(): TerminalStatus;
}

export interface HarnessOptions {
  reconnectAttempts?: number;
  /** Not the default 10, so a hard-coded 10 goes red (Delta 2 section 2.2). */
  startSlowSeconds?: number;
}

export function harness(options: HarnessOptions = {}): Harness {
  const terminal = new FakeTerminal();
  const sockets: FakeSocket[] = [];
  const peeks: Deferred<EnvironmentResult>[] = [];
  const starts: Deferred<EnvironmentResult>[] = [];
  const opens: Deferred<OpenTerminalResult>[] = [];
  const records: Deferred<LessonStartedResult>[] = [];
  const statuses: TerminalStatus[] = [];
  const sessionExpired = vi.fn();
  const size: TerminalSize = { cols: 120, rows: 40 };
  const next = <T>(queue: Deferred<T>[]): Promise<T> => {
    const deferred = new Deferred<T>();
    queue.push(deferred);
    return deferred.promise;
  };
  const machineOptions: MachineOptions = {
    actions: {
      peekEnvironment: () => next(peeks),
      startEnvironment: () => next(starts),
      openTerminal: () => next(opens),
      recordLessonStarted: () => next(records),
    },
    terminal,
    openSocket: (ticket, handlers) => {
      const socket = new FakeSocket(ticket, handlers);
      sockets.push(socket);
      return socket;
    },
    fitSize: () => ({ ...size }),
    clock: {
      now: () => Date.now() - T0,
      setTimer: (callback, ms) => {
        const id = setTimeout(callback, ms);
        return () => clearTimeout(id);
      },
    },
    onSessionExpired: sessionExpired,
    onStatus: (status) => statuses.push(status),
    reconnectAttempts: options.reconnectAttempts ?? 5,
    startSlowSeconds: options.startSlowSeconds ?? 7,
  };
  const machine = new TerminalMachine(machineOptions);
  return {
    machine,
    terminal,
    sockets,
    peeks,
    starts,
    opens,
    records,
    statuses,
    sessionExpired,
    size,
    lastSocket: () => last(sockets, "socket"),
    lastOpen: () => last(opens, "openTerminal call"),
    status: () => machine.status,
  };
}

function last<T>(items: T[], what: string): T {
  const item = items.at(-1);
  if (item === undefined) throw new Error(`no ${what} yet`);
  return item;
}

/** Lets resolved action promises reach the machine. */
export async function settle(): Promise<void> {
  for (let round = 0; round < 5; round += 1) await Promise.resolve();
}

export const RUNNING: EnvironmentResult = { kind: "running", outcome: "running" };

export function ticket(name: string, renewInMs: number | null = null): OpenTerminalResult {
  return { kind: "ticket", ticket: name, renewInMs };
}

/** Mount, peek `running`, a ticket: the machine waits for `attached` on the returned socket (AP). */
export async function toAttachPending(
  h: Harness,
  renewInMs: number | null = null,
): Promise<FakeSocket> {
  h.machine.mount();
  h.peeks[0]?.resolve(RUNNING);
  await settle();
  h.lastOpen().resolve(ticket("t1", renewInMs));
  await settle();
  return h.lastSocket();
}

/** As `toAttachPending`, then `attached` with `resumed: false` (RU). */
export async function toRunning(h: Harness, renewInMs: number | null = null): Promise<FakeSocket> {
  const socket = await toAttachPending(h, renewInMs);
  socket.attached(false);
  return socket;
}
