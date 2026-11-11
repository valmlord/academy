"use client";

import { FitAddon } from "@xterm/addon-fit";
import type { ITerminalOptions } from "@xterm/xterm";
import { type ReactElement, useEffect, useId, useRef, useState } from "react";
import { regionStep } from "@/components/region-cycle";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  environmentRegionHeading,
  environmentTabsLabel,
  terminalName,
  terminalTabLabel,
} from "@/lib/copy";
import { readScreenReaderMode, writeScreenReaderMode } from "@/lib/environment/screen-reader-mode";
import {
  browserClock,
  type EnvironmentActions,
  type MachineTerminal,
  TerminalMachine,
} from "@/lib/terminal/machine";
import { browserSocketOpener } from "@/lib/terminal/protocol";
import {
  isEnvironmentRunning,
  SESSION_EXPIRED_EVENT,
  type TerminalStatus,
} from "@/lib/terminal/state";
import { terminalTheme } from "@/lib/terminal/theme";
import { ActionsMenu } from "./actions-menu";
import { StatusBar } from "./status-bar";
import { statusView } from "./status-view";

// The lesson page's environment region (#32 design 3.6, D1; #106 design 2.5): the status bar with its action,
// the actions menu and the key hint, and one terminal tab holding the xterm terminal driven by the state machine
// of 3.6.1.

/** The parts of xterm's `Terminal` the region uses; the real class satisfies it (environment-region.tsx). */
export interface PanelTerminal extends MachineTerminal {
  readonly textarea: HTMLTextAreaElement | undefined;
  /** xterm's live options (`Terminal.options` is a mutable accessor): the screen reader mode is set here. */
  readonly options: ITerminalOptions;
  open(parent: HTMLElement): void;
  onData(listener: (data: string) => void): { dispose(): void };
  /** Never subscribed: a shell must not set the page title (design 5). Declared so a test can watch it. */
  onTitleChange(listener: (title: string) => void): { dispose(): void };
  attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean): void;
  loadAddon(addon: FitAddon): void;
}

export type TerminalFactory = (options: ITerminalOptions) => PanelTerminal;

export interface EnvironmentPanelProps {
  actions: EnvironmentActions;
  createTerminal: TerminalFactory;
  /** The course page, where the rejected state's action leads. */
  courseHref: string;
  reconnectAttempts: number;
  startSlowSeconds: number;
}

// Matches the frame's text-sm (design/system/proto.css `.terminal-frame`).
const TERMINAL_FONT_SIZE_PX = 14;

/**
 * Design 3.6: no `windowOptions` (xterm's defaults keep every window report off) and no `linkHandler`, so
 * xterm 6 ignores OSC 8 links that are not http(s) (`src/browser/OscLinkProvider.ts:72-82`) and asks before
 * opening the rest.
 */
export function terminalOptions(
  readToken: (name: string) => string,
  fontFamily: string,
): ITerminalOptions {
  return {
    theme: terminalTheme(readToken),
    fontFamily,
    fontSize: TERMINAL_FONT_SIZE_PX,
  };
}

const MODIFIER_KEYS: ReadonlySet<string> = new Set([
  "Shift",
  "Control",
  "Alt",
  "Meta",
  "CapsLock",
  "AltGraph",
]);

/**
 * Sets xterm's screen reader mode only when it differs, so the default-off path never writes the option at all and
 * the options stay exactly what the terminal was created with.
 */
function applyScreenReaderMode(terminal: PanelTerminal | null, isOn: boolean): void {
  if (terminal === null) return;
  if ((terminal.options.screenReaderMode ?? false) !== isOn)
    terminal.options.screenReaderMode = isOn;
}

/** Usable sizes only: a frame laid out at 0 px, or a proposal of no whole cells, is not fitted. */
function isFittable(frame: HTMLElement, cols: number, rows: number): boolean {
  if (frame.clientWidth === 0 || frame.clientHeight === 0) return false;
  return Number.isInteger(cols) && cols > 0 && Number.isInteger(rows) && rows > 0;
}

/** A key the terminal sends on (design 3.4): a keydown that is neither a region key nor a lone modifier. */
function isUserKey(event: KeyboardEvent): boolean {
  return event.type === "keydown" && regionStep(event) === 0 && !MODIFIER_KEYS.has(event.key);
}

export function EnvironmentPanel({
  actions,
  createTerminal,
  courseHref,
  reconnectAttempts,
  startSlowSeconds,
}: EnvironmentPanelProps): ReactElement {
  const [status, setStatus] = useState<TerminalStatus | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const actionsTriggerRef = useRef<HTMLButtonElement>(null);
  const machineRef = useRef<TerminalMachine | null>(null);
  const terminalRef = useRef<PanelTerminal | null>(null);
  // Off on the server and on the first client render, so both render the same markup; the remembered value is
  // read after mount (D7). The ref holds the value the effects apply, the state only re-renders the menu.
  const [isScreenReaderMode, setIsScreenReaderMode] = useState(false);
  const screenReaderModeRef = useRef(false);
  const isMac = useIsMac();
  const hintId = useId();
  const headingId = useId();

  // The next three effects run in this order on mount (#106 design 2.5): the stored mode is read first, the toggle
  // apply finds no terminal yet, and the terminal effect applies the mode once at creation, so a remembered "on"
  // is never assigned off first.
  useEffect(() => {
    const isOn = readScreenReaderMode(() => window.localStorage);
    screenReaderModeRef.current = isOn;
    setIsScreenReaderMode(isOn);
  }, []);

  // The state only triggers the run. It applies the ref, which is always set before the state: on mount the state
  // still reads off while the ref already holds the stored value.
  useEffect(() => {
    applyScreenReaderMode(terminalRef.current, screenReaderModeRef.current);
  }, [isScreenReaderMode]);

  // One machine per effect run: mount() works once and unmount() is final, so a machine kept across runs would
  // stay dead after React's development mount-unmount-mount. The terminal never takes focus by itself.
  useEffect(() => {
    const frame = frameRef.current;
    if (frame === null) return;
    const rootStyle = getComputedStyle(document.documentElement);
    const terminal = createTerminal(
      terminalOptions(
        (name) => rootStyle.getPropertyValue(name),
        getComputedStyle(frame).fontFamily,
      ),
    );
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(frame);
    terminal.textarea?.setAttribute("aria-label", terminalName);
    terminal.textarea?.setAttribute("aria-describedby", hintId);
    terminalRef.current = terminal;
    // A terminal created later (the effect re-runs when `actions` changes) starts in the remembered mode too.
    applyScreenReaderMode(terminal, screenReaderModeRef.current);
    const machine = new TerminalMachine({
      actions,
      terminal,
      openSocket: browserSocketOpener(WebSocket, window.location),
      fitSize: () => {
        const size = fit.proposeDimensions();
        if (size === undefined || !isFittable(frame, size.cols, size.rows)) return null;
        fit.fit();
        return { cols: size.cols, rows: size.rows };
      },
      clock: browserClock,
      onSessionExpired: () => window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT)),
      onStatus: setStatus,
      reconnectAttempts,
      startSlowSeconds,
    });
    machineRef.current = machine;
    const dataListener = terminal.onData((data) => machine.input(data));
    terminal.attachCustomKeyEventHandler((event) => {
      if (isUserKey(event)) machine.userInput();
      return true;
    });
    // Capture phase: xterm stops the paste event's propagation on its textarea.
    const onPaste = (): void => machine.userInput();
    frame.addEventListener("paste", onPaste, true);
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box !== undefined && (box.width === 0 || box.height === 0)) return;
      fit.fit();
      machine.fitChanged();
    });
    observer.observe(frame);
    machine.mount();
    return () => {
      observer.disconnect();
      frame.removeEventListener("paste", onPaste, true);
      dataListener.dispose();
      machineRef.current = null;
      terminalRef.current = null;
      // Disposes the terminal too (row 38).
      machine.unmount();
    };
  }, [actions, createTerminal, hintId, reconnectAttempts, startSlowSeconds]);

  const view = status === null ? null : statusView(status);

  function act(): void {
    machineRef.current?.act();
    // AC12: the action removes itself, so focus goes to the actions menu trigger, which every state keeps.
    actionsTriggerRef.current?.focus();
  }

  function changeScreenReaderMode(isOn: boolean): void {
    screenReaderModeRef.current = isOn;
    setIsScreenReaderMode(isOn);
    // Not saved (storage blocked or full), the mode still applies to this page; nothing else to do.
    writeScreenReaderMode(() => window.localStorage, isOn);
  }

  return (
    <section
      data-region
      aria-labelledby={headingId}
      className="flex min-w-0 flex-col gap-2 p-4 lg:sticky lg:top-0 lg:self-start"
    >
      <h2 id={headingId} className="sr-only">
        {environmentRegionHeading}
      </h2>
      <StatusBar
        view={view}
        courseHref={courseHref}
        hintId={hintId}
        isMac={isMac}
        onAct={act}
        actionsMenu={
          <ActionsMenu
            isEnvironmentRunning={status !== null && isEnvironmentRunning(status)}
            isScreenReaderMode={isScreenReaderMode}
            onRestart={() => machineRef.current?.restart()}
            onReset={() => machineRef.current?.reset()}
            onScreenReaderModeChange={changeScreenReaderMode}
            triggerRef={actionsTriggerRef}
          />
        }
      />
      <Tabs value="terminal" activationMode="automatic">
        <TabsList aria-label={environmentTabsLabel}>
          <TabsTrigger value="terminal">{terminalTabLabel}</TabsTrigger>
        </TabsList>
        {/* No tab stop of its own: the terminal inside is the panel's focusable content. */}
        <TabsContent
          value="terminal"
          tabIndex={-1}
          aria-busy={view?.isAwaitingAttach === true ? "true" : undefined}
        >
          {/* Connecting: keys are dropped until `attached` (design 3.6.1 row 32), so the cursor must not invite
              typing; nothing is lost, so the frame keeps its solid border. */}
          <div
            data-connection={
              view?.isConnectionLost === true
                ? "lost"
                : view?.isAwaitingAttach === true
                  ? "connecting"
                  : undefined
            }
            className="flex h-[min(70vh,40rem)] min-h-48 flex-col rounded-md border bg-terminal p-3 font-mono text-sm text-terminal-foreground focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring data-[connection=lost]:border-dashed data-[connection=lost]:border-warning [&[data-connection=lost]_.xterm-cursor]:invisible [&[data-connection=connecting]_.xterm-cursor]:invisible"
          >
            {/* Clipped: before the first fit xterm is 80 columns wide, which must never scroll the page sideways. */}
            <div ref={frameRef} className="min-h-0 flex-1 overflow-hidden" />
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}

/** The macOS hint variant (design 3.6), decided after mount so the server render never guesses. */
function useIsMac(): boolean {
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    const data: unknown = Reflect.get(navigator, "userAgentData");
    const platform =
      typeof data === "object" && data !== null && typeof Reflect.get(data, "platform") === "string"
        ? String(Reflect.get(data, "platform"))
        : navigator.platform;
    setIsMac(/mac/i.test(platform));
  }, []);
  return isMac;
}
