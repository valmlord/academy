"use client";

import { FitAddon } from "@xterm/addon-fit";
import type { ITerminalOptions } from "@xterm/xterm";
import Link from "next/link";
import { type ReactElement, useEffect, useId, useRef, useState } from "react";
import { regionStep } from "@/components/region-cycle";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  environmentRegionHeading,
  environmentTabsLabel,
  regionKeyHint,
  regionKeyHintMac,
  terminalName,
  terminalTabLabel,
} from "@/lib/copy";
import {
  browserClock,
  type EnvironmentActions,
  type MachineTerminal,
  TerminalMachine,
} from "@/lib/terminal/machine";
import { browserSocketOpener } from "@/lib/terminal/protocol";
import { SESSION_EXPIRED_EVENT, type TerminalStatus } from "@/lib/terminal/state";
import { terminalTheme } from "@/lib/terminal/theme";
import { type StatusView, statusView } from "./status-view";

// The lesson page's environment region (#32 design 3.6, D1): the status line with its action, the key hint,
// the start timer, and one terminal tab holding the xterm terminal driven by the state machine of 3.6.1.

/** The parts of xterm's `Terminal` the region uses; the real class satisfies it (environment-region.tsx). */
export interface PanelTerminal extends MachineTerminal {
  readonly textarea: HTMLTextAreaElement | undefined;
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
  const tabRef = useRef<HTMLButtonElement>(null);
  const machineRef = useRef<TerminalMachine | null>(null);
  const isMac = useIsMac();
  const hintId = useId();
  const headingId = useId();

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
    const machine = new TerminalMachine({
      actions,
      terminal,
      openSocket: browserSocketOpener(WebSocket, window.location),
      fitSize: () => {
        const size = fit.proposeDimensions();
        if (size === undefined) return null;
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
    const observer = new ResizeObserver(() => {
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
      // Disposes the terminal too (row 38).
      machine.unmount();
    };
  }, [actions, createTerminal, hintId, reconnectAttempts, startSlowSeconds]);

  const view = status === null ? null : statusView(status);

  function act(): void {
    machineRef.current?.act();
    // R2: the action removes itself, so focus goes to the terminal tab.
    tabRef.current?.focus();
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
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border bg-card px-4 py-2 text-sm text-card-foreground">
        <div className="flex min-w-0 flex-[1_1_16rem] items-start gap-2">
          {view?.startedAt != null ? (
            <Spinner role={undefined} aria-label={undefined} aria-hidden className="mt-0.5" />
          ) : null}
          <span role="status" className="flex flex-col">
            {view === null ? null : <StatusText view={view} />}
          </span>
          {view?.startedAt != null ? <StartTimer startedAt={view.startedAt} /> : null}
        </div>
        {view?.action != null ? (
          <div className="flex flex-wrap items-center gap-2">
            {view.action.kind === "act" ? (
              <Button type="button" size="sm" onClick={act}>
                {view.action.label}
              </Button>
            ) : (
              <Button asChild size="sm">
                <Link href={courseHref}>{view.action.label}</Link>
              </Button>
            )}
          </div>
        ) : null}
        <p
          id={hintId}
          hidden={view?.isHintShown !== true}
          className="basis-full text-xs text-muted-foreground"
        >
          {isMac ? regionKeyHintMac : regionKeyHint}
        </p>
      </div>
      <Tabs value="terminal" activationMode="automatic">
        <TabsList aria-label={environmentTabsLabel}>
          <TabsTrigger ref={tabRef} value="terminal">
            {terminalTabLabel}
          </TabsTrigger>
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

function StatusText({ view }: { view: StatusView }): ReactElement {
  return (
    <>
      <span>{view.text}</span>
      {view.note === null ? null : <span className="text-muted-foreground">{view.note}</span>}
    </>
  );
}

/** M:SS since `startedAt` (`performance.now()` time), as the prototype's `.timer`. */
function StartTimer({ startedAt }: { startedAt: number }): ReactElement {
  const [seconds, setSeconds] = useState(() => elapsedSeconds(startedAt));
  useEffect(() => {
    setSeconds(elapsedSeconds(startedAt));
    const id = setInterval(() => setSeconds(elapsedSeconds(startedAt)), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return (
    <span role="timer" className="text-muted-foreground tabular-nums">
      {`${minutes}:${rest}`}
    </span>
  );
}

function elapsedSeconds(startedAt: number): number {
  return Math.max(0, Math.floor((performance.now() - startedAt) / 1000));
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
