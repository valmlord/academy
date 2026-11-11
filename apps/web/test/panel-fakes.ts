import type { FitAddon } from "@xterm/addon-fit";
import type { ITerminalOptions } from "@xterm/xterm";
import type { PanelTerminal } from "@/components/environment/environment-panel";
import type { IdleActions } from "@/lib/environment/idle";
import type { EnvironmentActions } from "@/lib/terminal/machine";
import type {
  ActivityResult,
  EnvironmentResult,
  IdleResult,
  LessonStartedResult,
  OpenTerminalResult,
} from "@/lib/workspace/environment";
import { Deferred } from "./terminal-machine";

// Fakes for rendering the environment panel in jsdom, which has no canvas for xterm and no WebSocket server: a
// terminal, a socket, and server actions answered by hand from Deferred queues.

/** xterm's stand-in. Its `options` records every assignment after creation, so a test sees what the panel set. */
export class FakeXterm implements PanelTerminal {
  textarea: HTMLTextAreaElement | undefined;
  readonly options: ITerminalOptions;
  readonly optionWrites: [string, unknown][] = [];
  readonly writes: unknown[] = [];
  readonly addons: unknown[] = [];
  titleSubscriptions = 0;
  isDisposed = false;
  dataListener: ((data: string) => void) | null = null;
  keyHandler: ((event: KeyboardEvent) => boolean) | null = null;

  constructor(options: ITerminalOptions) {
    const writes = this.optionWrites;
    // Reads and Object.keys go to the options as created; only assignments are recorded.
    this.options = new Proxy(options, {
      set(target, key, value) {
        writes.push([String(key), value]);
        return Reflect.set(target, key, value);
      },
    });
  }

  open(parent: HTMLElement): void {
    this.textarea = document.createElement("textarea");
    // As xterm's own paste handler does (src/browser/Clipboard.ts), so only a capture listener sees the paste.
    this.textarea.addEventListener("paste", (event) => event.stopPropagation());
    parent.append(this.textarea);
  }

  write(data: string | Uint8Array, callback?: () => void): void {
    this.writes.push(data);
    callback?.();
  }

  dispose(): void {
    this.isDisposed = true;
  }

  onData(listener: (data: string) => void): { dispose(): void } {
    this.dataListener = listener;
    return { dispose: () => undefined };
  }

  onTitleChange(): { dispose(): void } {
    this.titleSubscriptions += 1;
    return { dispose: () => undefined };
  }

  attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean): void {
    this.keyHandler = handler;
  }

  loadAddon(addon: FitAddon): void {
    this.addons.push(addon);
  }
}

export class FakeWebSocket {
  static readonly instances: FakeWebSocket[] = [];
  binaryType: BinaryType = "blob";
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  readonly sent: string[] = [];

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {}

  receive(frame: unknown): void {
    this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(frame) }));
  }

  closedBy(code: number): void {
    this.onclose?.(new CloseEvent("close", { code }));
  }
}

export interface PanelActions {
  actions: EnvironmentActions & IdleActions;
  peeks: Deferred<EnvironmentResult>[];
  starts: Deferred<EnvironmentResult>[];
  opens: Deferred<OpenTerminalResult>[];
  records: Deferred<LessonStartedResult>[];
  restarts: Deferred<EnvironmentResult>[];
  resets: Deferred<EnvironmentResult>[];
  idleReads: Deferred<IdleResult>[];
  activities: Deferred<ActivityResult>[];
}

/** Server actions whose every call waits in its queue until the test answers it. */
export function fakePanelActions(): PanelActions {
  const peeks: Deferred<EnvironmentResult>[] = [];
  const starts: Deferred<EnvironmentResult>[] = [];
  const opens: Deferred<OpenTerminalResult>[] = [];
  const records: Deferred<LessonStartedResult>[] = [];
  const restarts: Deferred<EnvironmentResult>[] = [];
  const resets: Deferred<EnvironmentResult>[] = [];
  const idleReads: Deferred<IdleResult>[] = [];
  const activities: Deferred<ActivityResult>[] = [];
  const next = <T>(queue: Deferred<T>[]): Promise<T> => {
    const deferred = new Deferred<T>();
    queue.push(deferred);
    return deferred.promise;
  };
  return {
    actions: {
      peekEnvironment: () => next(peeks),
      startEnvironment: () => next(starts),
      openTerminal: () => next(opens),
      recordLessonStarted: () => next(records),
      restartEnvironment: () => next(restarts),
      resetEnvironment: () => next(resets),
      readEnvironmentIdle: () => next(idleReads),
      recordEnvironmentActivity: () => next(activities),
    },
    peeks,
    starts,
    opens,
    records,
    restarts,
    resets,
    idleReads,
    activities,
  };
}
