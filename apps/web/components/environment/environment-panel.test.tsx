import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { FitAddon } from "@xterm/addon-fit";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  actionsMenuLabel,
  cancelLabel,
  connectionLostStatus,
  detailsLabel,
  dockerDownStatus,
  environmentCreatingStatus,
  environmentMemoryLimitStatus,
  environmentNotRunningReason,
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
  resetConfirmLabel,
  resetDialogTitle,
  resetWorkspaceLabel,
  restartEnvironmentLabel,
  retryLabel,
  screenReaderModeLabel,
  shellExitedStatus,
  startAgainLabel,
  startFailedStatus,
  takenOverStatus,
  terminalName,
  volumeRecreatedNote,
  workspaceResetNote,
} from "@/lib/copy";
import { IDLE_CLEARED_EVENT, IDLE_WARNING_EVENT } from "@/lib/environment/idle";
import { SCREEN_READER_MODE_KEY } from "@/lib/environment/screen-reader-mode";
import { SESSION_EXPIRED_EVENT } from "@/lib/terminal/state";
import { RecordingResizeObserver } from "@/test/dom-stubs";
import { FakeWebSocket, FakeXterm, fakePanelActions, type PanelActions } from "@/test/panel-fakes";
import type { Deferred } from "@/test/terminal-machine";
import { EnvironmentPanel } from "./environment-panel";

// U-env-region (#32 design 10.3): the region with a fake terminal factory, fake server actions and a fake
// WebSocket, since jsdom has no canvas for xterm. Each state's copy, action and live-region rules, focus after a
// status action, and the options xterm is created with.

const COURSE_HREF = "/courses/c1";

interface Setup extends PanelActions {
  terminals: FakeXterm[];
  unmount: () => void;
  rerender: (actions: PanelActions["actions"]) => FakeXterm[];
}

function setup(options: { reconnectAttempts?: number; startSlowSeconds?: number } = {}): Setup {
  const terminals: FakeXterm[] = [];
  const fakes = fakePanelActions();
  const panel = (actions: PanelActions["actions"]): ReactElement => (
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
    />
  );
  const { unmount, rerender } = render(panel(fakes.actions));
  return {
    ...fakes,
    terminals,
    unmount,
    rerender: (actions) => {
      rerender(panel(actions));
      return terminals;
    },
  };
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
  await answer(env.peeks, { kind: "running", outcome: "running", isVolumeRecreated: false });
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

/** The status action, a button or the course link; the actions menu and the details trigger are not one. */
function actionButtons(): string[] {
  return Array.from(region().querySelectorAll("[data-status-action]")).map(
    (element) => element.textContent ?? "",
  );
}

/** The key hint, found through the terminal's description: its text sits mostly in Kbd children. */
function hintElement(env: Setup): HTMLElement | null {
  const id = env.terminals[0]?.textarea?.getAttribute("aria-describedby") ?? "";
  return document.getElementById(id);
}

function actionsTrigger(): HTMLElement {
  return screen.getByRole("button", { name: actionsMenuLabel });
}

/** Radix opens the menu on Enter at its trigger and focuses the first item. */
function openMenu(): void {
  actionsTrigger().focus();
  fireEvent.keyDown(actionsTrigger(), { key: "Enter" });
}

/** Radix selects a menu item on Enter, through the item's click. */
function pressEnter(element: Element): void {
  fireEvent.keyDown(element, { key: "Enter" });
}

async function openResetDialog(): Promise<HTMLElement> {
  openMenu();
  pressEnter(screen.getByRole("menuitem", { name: resetWorkspaceLabel }));
  return screen.findByRole("alertdialog", { name: resetDialogTitle });
}

beforeEach(() => {
  FakeWebSocket.instances.length = 0;
  RecordingResizeObserver.instances.length = 0;
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.stubGlobal("ResizeObserver", RecordingResizeObserver);
  // jsdom keeps localStorage across the tests of a file.
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
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
    expect(hintElement(env)).toBeVisible();
    expect(hintElement(env)).toHaveTextContent(regionKeyHint);
    expect(actionButtons()).toEqual([]);
  });

  it("hides the key hint while the environment starts", () => {
    const env = setup();

    expect(hintElement(env)).not.toBeVisible();
    expect(hintElement(env)).toHaveTextContent(regionKeyHint);
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
    await answer(env.peeks, { kind: "running", outcome: "running", isVolumeRecreated: false });

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

  it("shows neither the connecting frame nor a busy tab panel once the session expired while connecting", async () => {
    const env = setup();
    await answer(env.peeks, { kind: "running", outcome: "running", isVolumeRecreated: false });

    await answer(env.opens, { kind: "unauthenticated" });

    expect(statusText()).toBe(environmentRunningStatus);
    expect(actionButtons()).toEqual([]);
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
    await answer(env.peeks, { kind: "running", outcome: "running", isVolumeRecreated: false });
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
  it("moves focus to the actions menu trigger and restarts when the status action is used (P1)", async () => {
    const env = setup();
    await answer(env.peeks, { kind: "failed" });

    fireEvent.click(screen.getByRole("button", { name: retryLabel }));

    expect(actionsTrigger()).toHaveFocus();
    expect(env.starts).toHaveLength(1);
    expect(screen.queryByRole("button", { name: retryLabel })).toBeNull();
  });

  it("moves focus to the actions menu trigger from a click that left focus on the page (P1b)", async () => {
    const env = setup();
    const socket = await reachRunning(env);
    act(() => socket.closedBy(4002));
    await answer(env.peeks, { kind: "stopped" });
    expect(document.activeElement).toBe(document.body);

    fireEvent.click(screen.getByRole("button", { name: startAgainLabel }));

    expect(actionsTrigger()).toHaveFocus();
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

describe("EnvironmentPanel actions menu and reset dialog (#106)", () => {
  it("keeps an unavailable item focusable with its reason, and selecting it does nothing (P2)", () => {
    const env = setup();

    openMenu();

    const restart = screen.getByRole("menuitem", { name: restartEnvironmentLabel });
    expect(restart).toHaveFocus();
    expect(restart).toHaveAttribute("aria-disabled", "true");
    expect(restart).toHaveAccessibleDescription(environmentNotRunningReason);
    pressEnter(restart);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(env.restarts).toHaveLength(0);
  });

  it("restarts from the menu, closes it and returns focus to the trigger (P3)", async () => {
    const env = setup();
    await reachRunning(env);

    openMenu();
    pressEnter(screen.getByRole("menuitem", { name: restartEnvironmentLabel }));

    expect(env.restarts).toHaveLength(1);
    expect(screen.queryByRole("menu")).toBeNull();
    await waitFor(() => expect(actionsTrigger()).toHaveFocus());
  });

  it("asks before a reset: Esc cancels, the reset button resets, both end on the trigger (P4)", async () => {
    const env = setup();
    await reachRunning(env);

    await openResetDialog();
    await waitFor(() => expect(screen.getByRole("button", { name: cancelLabel })).toHaveFocus());
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await waitFor(() => expect(actionsTrigger()).toHaveFocus());
    expect(env.resets).toHaveLength(0);
    expect(document.body.style.pointerEvents).toBe("");

    const dialog = await openResetDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: resetConfirmLabel }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(env.resets).toHaveLength(1);
    await waitFor(() => expect(actionsTrigger()).toHaveFocus());
    expect(document.body.style.pointerEvents).toBe("");
  });

  it("ends on the trigger when a dialog button is clicked with focus left on the page (P4b)", async () => {
    const env = setup();
    await reachRunning(env);

    await openResetDialog();
    await waitFor(() => expect(screen.getByRole("button", { name: cancelLabel })).toHaveFocus());
    blurActive();
    fireEvent.click(screen.getByRole("button", { name: cancelLabel }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await waitFor(() => expect(actionsTrigger()).toHaveFocus());
    expect(env.resets).toHaveLength(0);

    const dialog = await openResetDialog();
    await waitFor(() => expect(screen.getByRole("button", { name: cancelLabel })).toHaveFocus());
    blurActive();
    fireEvent.click(within(dialog).getByRole("button", { name: resetConfirmLabel }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(env.resets).toHaveLength(1);
    await waitFor(() => expect(actionsTrigger()).toHaveFocus());
  });

  it("closes the reset dialog onto the trigger when the environment stops meanwhile (P11)", async () => {
    const env = setup();
    const socket = await reachRunning(env);
    await openResetDialog();

    act(() => socket.closedBy(4002));
    await answer(env.peeks, { kind: "stopped" });

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await waitFor(() => expect(actionsTrigger()).toHaveFocus());
    expect(env.resets).toHaveLength(0);
  });

  it("opens no reset dialog when the environment stops between the reset item and the menu's close (P11b)", async () => {
    const env = setup();
    const socket = await reachRunning(env);
    openMenu();
    pressEnter(screen.getByRole("menuitem", { name: resetWorkspaceLabel }));

    // Radix runs the menu's close handler in a setTimeout(0); the stop lands before it.
    act(() => socket.closedBy(4002));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await answer(env.peeks, { kind: "stopped" });

    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(env.resets).toHaveLength(0);
  });

  it("keeps the status announced while the modal menu hides the rest of the page (P13)", async () => {
    const env = setup();
    await reachRunning(env);
    const textarea = env.terminals[0]?.textarea;

    openMenu();

    expect(within(region()).getByRole("status").closest('[aria-hidden="true"]')).toBeNull();
    expect(textarea?.closest('[aria-hidden="true"]')).not.toBeNull();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(textarea?.closest('[aria-hidden="true"]')).toBeNull());
  });
});

describe("EnvironmentPanel screen reader mode (#106, D7)", () => {
  it("turns the mode on and off from the menu and remembers each choice (P5)", () => {
    const env = setup();
    const terminal = env.terminals[0];
    expect(terminal?.options).not.toHaveProperty("screenReaderMode");

    toggleScreenReaderMode();
    expect(terminal?.options.screenReaderMode).toBe(true);
    expect(localStorage.getItem(SCREEN_READER_MODE_KEY)).toBe("on");

    toggleScreenReaderMode();
    expect(terminal?.options.screenReaderMode).toBe(false);
    expect(localStorage.getItem(SCREEN_READER_MODE_KEY)).toBe("off");
    expect(env.terminals).toHaveLength(1);
  });

  it("starts a remembered mode once at creation, and in a terminal created later (P5b)", () => {
    localStorage.setItem(SCREEN_READER_MODE_KEY, "on");
    const env = setup();

    expect(env.terminals[0]?.optionWrites).toEqual([["screenReaderMode", true]]);
    openMenu();
    expect(screen.getByRole("menuitemcheckbox", { name: screenReaderModeLabel })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    const terminals = env.rerender(fakePanelActions().actions);

    expect(terminals).toHaveLength(2);
    expect(terminals[1]?.options.screenReaderMode).toBe(true);
  });

  it("works without storage: starts off, logs nothing and still toggles (P5c)", () => {
    const blocked = (): never => {
      throw new DOMException("storage is blocked", "SecurityError");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(blocked);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(blocked);
    const consoleError = vi.spyOn(console, "error");
    const env = setup();

    expect(statusText()).toBe(environmentStartingStatus);
    toggleScreenReaderMode();

    expect(env.terminals[0]?.options.screenReaderMode).toBe(true);
    openMenu();
    expect(screen.getByRole("menuitemcheckbox", { name: screenReaderModeLabel })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe("EnvironmentPanel status bar (#106)", () => {
  it("shows the error code behind a collapsed details button, and no button while running (P6)", async () => {
    const env = setup();
    await answer(env.peeks, { kind: "docker-down" });
    const details = screen.getByRole("button", { name: detailsLabel });
    const code = document.getElementById(details.getAttribute("aria-controls") ?? "");
    expect(details).toHaveAttribute("aria-expanded", "false");
    expect(code).not.toBeVisible();

    fireEvent.click(details);

    expect(details).toHaveAttribute("aria-expanded", "true");
    expect(code).toBeVisible();
    expect(code).toHaveTextContent("docker-unavailable");
    fireEvent.click(screen.getByRole("button", { name: retryLabel }));
    await answer(env.starts, { kind: "running", outcome: "running", isVolumeRecreated: false });
    expect(screen.queryByRole("button", { name: detailsLabel })).toBeNull();
  });

  it("notes the reset after the running status once the reset workspace is attached (P7)", async () => {
    const env = setup();
    await reachRunning(env);
    const dialog = await openResetDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: resetConfirmLabel }));

    await answer(env.resets, { kind: "running", outcome: "created", isVolumeRecreated: false });
    await answer(env.opens, { kind: "ticket", ticket: "t2", renewInMs: null });
    const socket = lastSocket();
    act(() => socket.receive({ t: "attached", resumed: false }));

    expect(statusText()).toBe(environmentRunningStatus + workspaceResetNote);
  });

  it("notes the recreated working folder after the running status when the start recreated it", async () => {
    const env = setup();

    await answer(env.peeks, { kind: "absent" });
    await answer(env.starts, { kind: "running", outcome: "created", isVolumeRecreated: true });
    await answer(env.opens, { kind: "ticket", ticket: "t", renewInMs: null });
    const socket = lastSocket();
    act(() => socket.receive({ t: "attached", resumed: false }));

    expect(statusText()).toBe(environmentRunningStatus + volumeRecreatedNote);
  });

  it("shows the running status without a note on a first visit whose start created the workspace", async () => {
    const env = setup();

    await answer(env.peeks, { kind: "absent" });
    await answer(env.starts, { kind: "running", outcome: "created", isVolumeRecreated: false });
    await answer(env.opens, { kind: "ticket", ticket: "t", renewInMs: null });
    const socket = lastSocket();
    act(() => socket.receive({ t: "attached", resumed: false }));

    expect(statusText()).toBe(environmentRunningStatus);
  });

  it.each<{ name: string; reach: (env: Setup) => Promise<void>; status: string }>([
    {
      name: "docker-down",
      reach: (env) => answer(env.peeks, { kind: "docker-down" }),
      status: "destructive",
    },
    { name: "running", reach: async (env) => void (await reachRunning(env)), status: "success" },
    {
      name: "reconnecting",
      reach: async (env) => {
        const socket = await reachRunning(env);
        act(() => socket.closedBy(1006));
      },
      status: "warning",
    },
  ])("draws the $status status icon while $name (P10)", async ({ reach, status }) => {
    const env = setup();

    await reach(env);

    expect(region().querySelectorAll("[data-status]")).toHaveLength(1);
    expect(region().querySelector("[data-status]")).toHaveAttribute("data-status", status);
  });
});

describe("EnvironmentPanel unmount (#106)", () => {
  it("disconnects the resize observer and removes the capture paste listener (P8)", () => {
    const add = vi.spyOn(EventTarget.prototype, "addEventListener");
    const remove = vi.spyOn(EventTarget.prototype, "removeEventListener");
    const env = setup();
    const frame = env.terminals[0]?.textarea?.parentElement;
    const added = add.mock.calls.findIndex(
      ([type], index) => type === "paste" && add.mock.contexts[index] === frame,
    );
    const onPaste = add.mock.calls[added]?.[1];

    env.unmount();

    const observer = RecordingResizeObserver.instances.find(
      (instance) => frame != null && instance.observed.includes(frame),
    );
    expect(observer?.isDisconnected).toBe(true);
    expect(onPaste).toBeTypeOf("function");
    const removed = remove.mock.calls.some(
      ([type, listener, options], index) =>
        type === "paste" &&
        listener === onPaste &&
        options === true &&
        remove.mock.contexts[index] === frame,
    );
    expect(removed).toBe(true);
  });
});

function toggleScreenReaderMode(): void {
  openMenu();
  pressEnter(screen.getByRole("menuitemcheckbox", { name: screenReaderModeLabel }));
}

/** What a press in a browser that does not focus a clicked button leaves: focus on the page. */
function blurActive(): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement) active.blur();
  expect(document.activeElement).toBe(document.body);
}

function frameOf(terminal: FakeXterm | undefined): HTMLElement | null {
  return terminal?.textarea?.parentElement?.parentElement ?? null;
}

describe("EnvironmentPanel idle watcher (#106 design 5)", () => {
  const WARNING = { kind: "idle", warnInMs: 0, stopInMs: 240_000, warningMinutes: 5 } as const;

  const removals: (() => void)[] = [];

  afterEach(() => {
    for (const remove of removals.splice(0)) remove();
  });

  /** Every detail the panel dispatched with `type` on window, recorded until the test ends. */
  function recordDetails(type: string): unknown[] {
    const details: unknown[] = [];
    const listener = (event: Event): void => {
      details.push(event instanceof CustomEvent ? event.detail : undefined);
    };
    window.addEventListener(type, listener);
    removals.push(() => window.removeEventListener(type, listener));
    return details;
  }

  async function flushMicrotasks(): Promise<void> {
    await act(async () => undefined);
  }

  it("reads once when running, then dispatches the warning and, after a stop, the cleared event (P9)", async () => {
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    const warnings = recordDetails(IDLE_WARNING_EVENT);
    const cleared = recordDetails(IDLE_CLEARED_EVENT);
    const env = setup();
    const socket = await reachRunning(env);
    expect(env.idleReads).toHaveLength(1);

    await answer(env.idleReads, WARNING);
    await flushMicrotasks();
    expect(warnings).toEqual([{ minutes: 5 }]);

    act(() => socket.closedBy(4002));
    await answer(env.peeks, { kind: "stopped" });
    await flushMicrotasks();
    expect(cleared).toEqual([{ isEnvironmentStopped: true }]);
  });

  it("dispatches the cleared event with no stop when a restart ends the running state (P9)", async () => {
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    const cleared = recordDetails(IDLE_CLEARED_EVENT);
    const env = setup();
    await reachRunning(env);
    await answer(env.idleReads, WARNING);
    await flushMicrotasks();

    openMenu();
    pressEnter(screen.getByRole("menuitem", { name: restartEnvironmentLabel }));
    await flushMicrotasks();

    expect(env.restarts).toHaveLength(1);
    expect(cleared).toEqual([{ isEnvironmentStopped: false }]);
  });

  it("reads nothing in a tab hidden when the environment starts running, and reads once it shows (P12)", async () => {
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    const env = setup();
    await reachRunning(env);
    expect(env.idleReads).toHaveLength(0);

    hidden.mockReturnValue(false);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(env.idleReads).toHaveLength(1);
  });
});
