import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Notifications } from "@/components/notifications";
import { SHOW_PANE_EVENT } from "@/components/region-cycle";
import { continueWorkLabel, idleWarningMessage, startAgainLabel } from "@/lib/copy";
import { RecordingResizeObserver } from "@/test/dom-stubs";
import { FakeWebSocket, FakeXterm, fakePanelActions } from "@/test/panel-fakes";
import type { Deferred } from "@/test/terminal-machine";
import { EnvironmentPanel } from "./environment-panel";

// NI1 (#106 design 7.1): the panel's idle watcher and "Уведомления" together. An idle stop while focus is on the
// warning's button sends focus to the panel's start-again action (ia.md R2 item 5), not to the element the
// learner came from and not to the lesson pane, and never shows a pane.

vi.mock("next/navigation", () => ({
  usePathname: () => "/courses/c1/lessons/l1",
  useSearchParams: () => new URLSearchParams(""),
}));

async function answer<T>(queue: Deferred<T>[], value: T): Promise<void> {
  const pending = queue.at(-1);
  if (pending === undefined) throw new Error("no call to answer");
  await act(async () => pending.resolve(value));
}

beforeEach(() => {
  FakeWebSocket.instances.length = 0;
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.stubGlobal("ResizeObserver", RecordingResizeObserver);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ session: {} }), { status: 200 })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the idle warning between the panel and Notifications (NI1)", () => {
  it("lands on the start-again action when the environment stops idle under the warning", async () => {
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    const consoleError = vi.spyOn(console, "error");
    const shown: unknown[] = [];
    const onShow = (event: Event): void => {
      shown.push(event);
    };
    document.addEventListener(SHOW_PANE_EVENT, onShow);
    const fakes = fakePanelActions();
    render(
      <>
        <Notifications />
        <section data-region data-pane="lesson">
          <button type="button">lesson</button>
        </section>
        <EnvironmentPanel
          actions={fakes.actions}
          createTerminal={(options) => new FakeXterm(options)}
          courseHref="/courses/c1"
          reconnectAttempts={5}
          startSlowSeconds={7}
        />
      </>,
    );
    await answer(fakes.peeks, { kind: "running", outcome: "running" });
    await answer(fakes.opens, { kind: "ticket", ticket: "t", renewInMs: null });
    const socket = FakeWebSocket.instances.at(-1);
    if (socket === undefined) throw new Error("no socket");
    act(() => socket.receive({ t: "attached", resumed: false }));
    await answer(fakes.idleReads, {
      kind: "idle",
      warnInMs: 0,
      stopInMs: 240_000,
      warningMinutes: 5,
    });
    await act(async () => undefined);
    act(() => screen.getByRole("button", { name: "lesson" }).focus());
    act(() => screen.getByRole("button", { name: continueWorkLabel }).focus());

    await act(async () => {
      socket.closedBy(4002);
      fakes.peeks.at(-1)?.resolve({ kind: "stopped" });
    });

    document.removeEventListener(SHOW_PANE_EVENT, onShow);
    expect(screen.queryByText(idleWarningMessage(5))).toBeNull();
    expect(screen.getByRole("button", { name: startAgainLabel })).toHaveFocus();
    expect(document.activeElement).not.toBe(document.body);
    expect(shown).toEqual([]);
    expect(consoleError).not.toHaveBeenCalled();
  });
});
