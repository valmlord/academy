import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EnvironmentPanel } from "@/components/environment/environment-panel";
import { SHOW_PANE_EVENT } from "@/components/region-cycle";
import { splitHandleLabel } from "@/lib/copy";
import { RecordingResizeObserver } from "@/test/dom-stubs";
import { FakeWebSocket, FakeXterm, fakePanelActions } from "@/test/panel-fakes";
import type { Deferred } from "@/test/terminal-machine";
import { LessonLayout } from "./lesson-layout";
import { LESSON_PANE_IDS } from "./lesson-panels";
import { PaneSwitch } from "./pane-switch";

// LL1-LL4 (#106 design 7.1): the layout's context, its show-pane listener, its observer and the split value.

const lessonPane = (
  <section id={LESSON_PANE_IDS.lesson} data-region data-pane="lesson" data-testid="lesson">
    <PaneSwitch />
    <button type="button">lesson</button>
  </section>
);

const environmentPane = (
  <section id={LESSON_PANE_IDS.environment} data-region data-pane="environment">
    <button type="button">environment</button>
  </section>
);

function main(): HTMLElement {
  const element = document.getElementById("main");
  if (element === null) throw new Error("no main");
  return element;
}

async function answer<T>(queue: Deferred<T>[], value: T): Promise<void> {
  const pending = queue.at(-1);
  if (pending === undefined) throw new Error("no call to answer");
  await act(async () => pending.resolve(value));
}

beforeEach(() => {
  FakeWebSocket.instances.length = 0;
  RecordingResizeObserver.instances.length = 0;
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.stubGlobal("ResizeObserver", RecordingResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LessonLayout", () => {
  it("names the environment tab stopped once the panel reports a stop (LL1)", async () => {
    const fakes = fakePanelActions();
    render(
      <LessonLayout
        lesson={lessonPane}
        environment={
          <EnvironmentPanel
            actions={fakes.actions}
            createTerminal={(options) => new FakeXterm(options)}
            courseHref="/courses/c1"
            reconnectAttempts={5}
            startSlowSeconds={7}
          />
        }
      />,
    );
    await answer(fakes.peeks, { kind: "running", outcome: "running" });
    await answer(fakes.opens, { kind: "ticket", ticket: "t", renewInMs: null });
    const socket = FakeWebSocket.instances.at(-1);
    if (socket === undefined) throw new Error("no socket");
    act(() => socket.receive({ t: "attached", resumed: false }));

    act(() => socket.closedBy(4002));
    await answer(fakes.peeks, { kind: "stopped" });

    expect(
      within(screen.getByTestId("lesson")).getByRole("tab", { name: "Окружение остановлено" }),
    ).toBeInTheDocument();
  });

  it("shows the pane a show-pane event names and ignores any other detail (LL2)", () => {
    render(<LessonLayout lesson={lessonPane} environment={environmentPane} />);

    act(() => {
      main().dispatchEvent(new CustomEvent(SHOW_PANE_EVENT, { detail: { pane: "environment" } }));
    });
    expect(main()).toHaveAttribute("data-active-pane", "environment");

    for (const event of [
      new CustomEvent(SHOW_PANE_EVENT, { detail: { pane: "x" } }),
      new CustomEvent(SHOW_PANE_EVENT, { detail: {} }),
      new CustomEvent(SHOW_PANE_EVENT, { detail: null }),
      new Event(SHOW_PANE_EVENT),
    ]) {
      act(() => {
        main().dispatchEvent(event);
      });
      expect(main()).toHaveAttribute("data-active-pane", "environment");
    }
  });

  it("disconnects its observer of main on unmount (LL3)", () => {
    const { unmount } = render(<LessonLayout lesson={lessonPane} environment={environmentPane} />);
    const element = main();

    unmount();

    const observer = RecordingResizeObserver.instances.find((instance) =>
      instance.observed.includes(element),
    );
    expect(observer?.isDisconnected).toBe(true);
  });

  it("moves the split with the keys and applies it to the layout (LL4)", () => {
    render(<LessonLayout lesson={lessonPane} environment={environmentPane} />);
    const separator = screen.getByRole("separator", { name: splitHandleLabel });
    separator.focus();

    fireEvent.keyDown(separator, { key: "ArrowRight" });
    expect(separator).toHaveAttribute("aria-valuenow", "55");
    expect(main().style.getPropertyValue("--split-left")).toBe("55%");

    fireEvent.keyDown(separator, { key: "Enter" });
    expect(main().style.getPropertyValue("--split-left")).toBe("50%");
  });

  it("closes the handle's tooltip on Escape while focus is elsewhere (WCAG 1.4.13)", () => {
    render(<LessonLayout lesson={lessonPane} environment={environmentPane} />);
    const separator = screen.getByRole("separator", { name: splitHandleLabel });
    fireEvent.pointerEnter(separator);
    const tip = screen.getByRole("tooltip");
    expect(tip).toBeVisible();

    fireEvent.keyDown(document.body, { key: "Escape" });

    expect(tip).not.toBeVisible();
    expect(document.activeElement).toBe(document.body);
  });
});
