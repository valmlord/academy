import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { FitAddon } from "@xterm/addon-fit";
import type { ITerminalOptions } from "@xterm/xterm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  connectionLostStatus,
  dockerDownStatus,
  environmentCreatingStatus,
  environmentMemoryLimitStatus,
  environmentRegionHeading,
  environmentRejectedStatus,
  environmentRunningStatus,
  environmentSlowNote,
  environmentStartingStatus,
  environmentStoppedStatus,
  imageMissingStatus,
  openCourseLabel,
  openHereLabel,
  openNewSessionLabel,
  reconnectFailedStatus,
  reconnectLabel,
  regionKeyHint,
  retryLabel,
  shellExitedStatus,
  startAgainLabel,
  startFailedStatus,
  takenOverStatus,
  terminalName,
  terminalTabLabel,
} from "@/lib/copy";
import type { EnvironmentActions } from "@/lib/terminal/machine";
import { SESSION_EXPIRED_EVENT } from "@/lib/terminal/state";
import type {
  EnvironmentResult,
  LessonStartedResult,
  OpenTerminalResult,
} from "@/lib/workspace/environment";
import { Deferred } from "@/test/terminal-machine";
import { EnvironmentPanel, type PanelTerminal } from "./environment-panel";

// U-env-region (#32 design 10.3): the region with a fake terminal factory, fake server actions and a fake
// WebSocket, since jsdom has no canvas for xterm. Each state's copy, action and live-region rules, focus after a
// status action, and the options xterm is created with.

const COURSE_HREF = "/courses/c1";

class FakeXterm implements PanelTerminal {
  textarea: HTMLTextAreaElement | undefined;
  readonly writes: unknown[] = [];
  readonly addons: unknown[] = [];
  titleSubscriptions = 0;
  isDisposed = false;
  dataListener: ((data: string) => void) | null = null;
  keyHandler: ((event: KeyboardEvent) => boolean) | null = null;

  constructor(readonly options: ITerminalOptions) {}

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

class FakeWebSocket {
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

class NoResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

interface Setup {
  terminals: FakeXterm[];
  peeks: Deferred<EnvironmentResult>[];
  starts: Deferred<EnvironmentResult>[];
  opens: Deferred<OpenTerminalResult>[];
  records: Deferred<LessonStartedResult>[];
  unmount: () => void;
}

function setup(options: { reconnectAttempts?: number; startSlowSeconds?: number } = {}): Setup {
  const terminals: FakeXterm[] = [];
  const peeks: Deferred<EnvironmentResult>[] = [];
  const starts: Deferred<EnvironmentResult>[] = [];
  const opens: Deferred<OpenTerminalResult>[] = [];
  const records: Deferred<LessonStartedResult>[] = [];
  const next = <T,>(queue: Deferred<T>[]): Promise<T> => {
    const deferred = new Deferred<T>();
    queue.push(deferred);
    return deferred.promise;
  };
  const actions: EnvironmentActions = {
    peekEnvironment: () => next(peeks),
    startEnvironment: () => next(starts),
    openTerminal: () => next(opens),
    recordLessonStarted: () => next(records),
  };
  const { unmount } = render(
    <EnvironmentPanel
      actions={actions}
      createTerminal={(terminalOptions) => {
        const terminal = new FakeXterm(terminalOptions);
        terminals.push(terminal);
        return terminal;
      }}
      courseHref={COURSE_HREF}
      reconnectAttempts={options.reconnectAttempts ?? 5}
      startSlowSeconds={options.startSlowSeconds ?? 7}
    />,
  );
  return { terminals, peeks, starts, opens, records, unmount };
}

async function answer<T>(queue: Deferred<T>[], value: T): Promise<void> {
  const pending = queue.at(-1);
  if (pending === undefined) throw new Error("no call to answer");
  await act(async () => pending.resolve(value));
}

async function fail<T>(queue: Deferred<T>[]): Promise<void> {
  const pending = queue.at(-1);
  if (pending === undefined) throw new Error("no call to fail");
  await act(async () => pending.reject(new Error("network")));
}

function lastSocket(): FakeWebSocket {
  const socket = FakeWebSocket.instances.at(-1);
  if (socket === undefined) throw new Error("no socket");
  return socket;
}

/** Peek running, a ticket, `attached`: the running state. */
async function reachRunning(env: Setup): Promise<FakeWebSocket> {
  await answer(env.peeks, { kind: "running", outcome: "running" });
  await answer(env.opens, { kind: "ticket", ticket: "t", renewInMs: null });
  const socket = lastSocket();
  act(() => socket.receive({ t: "attached", resumed: false }));
  return socket;
}

function statusText(): string {
  return screen.getByRole("status").textContent ?? "";
}

function region(): HTMLElement {
  return screen.getByRole("region", { name: environmentRegionHeading });
}

/** The status action, a button or the course link; the terminal tab is a `tab`, not counted. */
function actionButtons(): string[] {
  return within(region())
    .queryAllByRole("button")
    .concat(within(region()).queryAllByRole("link"))
    .map((element) => element.textContent ?? "");
}

beforeEach(() => {
  FakeWebSocket.instances.length = 0;
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.stubGlobal("ResizeObserver", NoResizeObserver);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("EnvironmentPanel states (U-env-region)", () => {
  it("says it starts the environment, with the spinner's timer outside the status line", () => {
    setup();

    expect(statusText()).toBe(environmentStartingStatus);
    const timer = screen.getByRole("timer");
    expect(timer).toHaveTextContent("0:00");
    expect(screen.getByRole("status")).not.toContainElement(timer);
    expect(actionButtons()).toEqual([]);
  });

  it("says it creates the environment when the peek finds none", async () => {
    const env = setup();

    await answer(env.peeks, { kind: "absent" });

    expect(statusText()).toBe(environmentCreatingStatus);
    expect(env.starts).toHaveLength(1);
  });

  it("adds the slow note after startSlowSeconds, not before", async () => {
    vi.useFakeTimers();
    setup({ startSlowSeconds: 7 });

    await act(async () => vi.advanceTimersByTime(6999));
    expect(statusText()).toBe(environmentStartingStatus);
    await act(async () => vi.advanceTimersByTime(1));

    expect(statusText()).toBe(environmentStartingStatus + environmentSlowNote);
    expect(screen.getByRole("timer")).toHaveTextContent("0:07");
  });

  it("says the environment runs, with the key hint and no timer, once attached", async () => {
    const env = setup();

    await reachRunning(env);

    expect(statusText()).toBe(environmentRunningStatus);
    expect(screen.queryByRole("timer")).toBeNull();
    expect(screen.getByText(regionKeyHint)).toBeVisible();
    expect(actionButtons()).toEqual([]);
  });

  it("hides the key hint while the environment starts", () => {
    setup();

    expect(screen.getByText(regionKeyHint)).not.toBeVisible();
  });

  it("shows the lost-connection frame without a busy tab panel while reconnecting", async () => {
    const env = setup();
    const socket = await reachRunning(env);

    act(() => socket.closedBy(1006));

    expect(statusText()).toBe(connectionLostStatus);
    expect(frameOf(env.terminals[0])).toHaveAttribute("data-connection", "lost");
    expect(screen.getByRole("tabpanel")).not.toHaveAttribute("aria-busy");
  });

  it("hides the cursor and marks the tab panel busy while the terminal is not attached yet", async () => {
    const env = setup();
    await answer(env.peeks, { kind: "running", outcome: "running" });

    await answer(env.opens, { kind: "ticket", ticket: "t", renewInMs: null });

    expect(statusText()).toBe(environmentRunningStatus);
    expect(frameOf(env.terminals[0])).toHaveAttribute("data-connection", "connecting");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-busy", "true");
  });

  it("neither hides the cursor nor marks the tab panel busy once attached", async () => {
    const env = setup();

    await reachRunning(env);

    expect(frameOf(env.terminals[0])).not.toHaveAttribute("data-connection");
    expect(screen.getByRole("tabpanel")).not.toHaveAttribute("aria-busy");
  });

  it.each([
    { code: 4001, text: takenOverStatus, label: openHereLabel },
    { code: 4000, text: shellExitedStatus, label: openNewSessionLabel },
  ])("shows $text with its action after close $code", async ({ code, text, label }) => {
    const env = setup();
    const socket = await reachRunning(env);

    act(() => socket.closedBy(code));

    expect(statusText()).toBe(text);
    expect(actionButtons()).toEqual([label]);
  });

  it.each([
    { peek: { kind: "stopped" } as const, text: environmentStoppedStatus },
    { peek: { kind: "limits" } as const, text: environmentMemoryLimitStatus },
  ])("shows $text with Start again after the environment stopped", async ({ peek, text }) => {
    const env = setup();
    const socket = await reachRunning(env);

    act(() => socket.closedBy(4002));
    await answer(env.peeks, peek);

    expect(statusText()).toBe(text);
    expect(actionButtons()).toEqual([startAgainLabel]);
  });

  it.each([
    { result: { kind: "docker-down" } as const, text: dockerDownStatus },
    {
      result: { kind: "image-missing", image: "academy-workspace:dev" } as const,
      text: imageMissingStatus("academy-workspace:dev"),
    },
    { result: { kind: "failed" } as const, text: startFailedStatus },
  ])("shows $text with Retry when the start fails", async ({ result, text }) => {
    const env = setup();

    await answer(env.peeks, result);

    expect(statusText()).toBe(text);
    expect(actionButtons()).toEqual([retryLabel]);
    expect(screen.queryByRole("timer")).toBeNull();
  });

  it("links to the course when the environment is rejected", async () => {
    const env = setup();

    await answer(env.peeks, { kind: "rejected" });

    expect(statusText()).toBe(environmentRejectedStatus);
    expect(screen.getByRole("link", { name: openCourseLabel })).toHaveAttribute(
      "href",
      COURSE_HREF,
    );
  });

  it("offers to reconnect once every attempt failed", async () => {
    const env = setup({ reconnectAttempts: 1 });
    vi.useFakeTimers();
    await answer(env.peeks, { kind: "running", outcome: "running" });
    await fail(env.opens);
    await act(async () => vi.advanceTimersByTime(1000));

    await fail(env.opens);

    expect(statusText()).toBe(reconnectFailedStatus);
    expect(actionButtons()).toEqual([reconnectLabel]);
  });

  it("keeps the text without an action and raises the session alert when the session expired", async () => {
    const env = setup();
    const onExpired = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);

    await answer(env.peeks, { kind: "unauthenticated" });
    window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);

    expect(onExpired).toHaveBeenCalledOnce();
    expect(statusText()).toBe(environmentStartingStatus);
    expect(screen.queryByRole("timer")).toBeNull();
    expect(actionButtons()).toEqual([]);
  });
});

describe("EnvironmentPanel actions and focus (U-env-region)", () => {
  it("moves focus to the terminal tab and restarts when the status action is used", async () => {
    const env = setup();
    await answer(env.peeks, { kind: "failed" });

    fireEvent.click(screen.getByRole("button", { name: retryLabel }));

    expect(screen.getByRole("tab", { name: terminalTabLabel })).toHaveFocus();
    expect(env.starts).toHaveLength(1);
    expect(screen.queryByRole("button", { name: retryLabel })).toBeNull();
  });

  it("never focuses anything by itself while starting, attaching or running", async () => {
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    const env = setup();

    await reachRunning(env);

    expect(focus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(document.body);
  });
});

describe("EnvironmentPanel terminal wiring (U-env-region)", () => {
  it("creates xterm without windowOptions or linkHandler, and with no title or clipboard hooks", () => {
    const env = setup();
    const [terminal] = env.terminals;

    expect(env.terminals).toHaveLength(1);
    expect(terminal?.options).not.toHaveProperty("windowOptions");
    expect(terminal?.options).not.toHaveProperty("linkHandler");
    expect(Object.keys(terminal?.options ?? {}).sort()).toEqual([
      "fontFamily",
      "fontSize",
      "theme",
    ]);
    expect(terminal?.titleSubscriptions).toBe(0);
    expect(terminal?.addons).toHaveLength(1);
    expect(terminal?.addons[0]).toBeInstanceOf(FitAddon);
  });

  it("names xterm's textarea and ties it to the key hint", () => {
    const env = setup();
    const textarea = env.terminals[0]?.textarea;

    expect(textarea).toHaveAttribute("aria-label", terminalName);
    const hintId = textarea?.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(hintId)).toHaveTextContent(regionKeyHint);
  });

  it("records the lesson as started on a typed key or a paste, not on a region key or a lone modifier", async () => {
    const env = setup();
    await reachRunning(env);
    const terminal = env.terminals[0];
    const press = (init: KeyboardEventInit): boolean | undefined =>
      terminal?.keyHandler?.(new KeyboardEvent("keydown", init));

    expect(press({ key: "F6", code: "F6" })).toBe(true);
    press({ key: ".", code: "Period", ctrlKey: true, shiftKey: true });
    press({ key: "Shift", code: "ShiftLeft", shiftKey: true });
    terminal?.keyHandler?.(new KeyboardEvent("keyup", { key: "a", code: "KeyA" }));
    expect(env.records).toHaveLength(0);

    expect(press({ key: "a", code: "KeyA" })).toBe(true);
    expect(env.records).toHaveLength(1);
  });

  it("records the lesson as started on a paste into the terminal", async () => {
    const env = setup();
    await reachRunning(env);

    fireEvent.paste(env.terminals[0]?.textarea ?? document.body);

    expect(env.records).toHaveLength(1);
  });

  it("sends terminal data to the shell and disposes the terminal on unmount", async () => {
    const env = setup();
    const socket = await reachRunning(env);
    const terminal = env.terminals[0];

    act(() => terminal?.dataListener?.("ls\r"));
    env.unmount();

    expect(socket.sent.map((text) => JSON.parse(text))).toContainEqual({ t: "input", d: "ls\r" });
    expect(terminal?.isDisposed).toBe(true);
  });
});

function frameOf(terminal: FakeXterm | undefined): HTMLElement | null {
  return terminal?.textarea?.parentElement?.parentElement ?? null;
}
