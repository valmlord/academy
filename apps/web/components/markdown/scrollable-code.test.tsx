import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { codeBlockLabel } from "@/lib/copy";
import { RecordingResizeObserver } from "@/test/dom-stubs";
import { ScrollableCode } from "./scrollable-code";

beforeEach(() => {
  RecordingResizeObserver.instances.length = 0;
  vi.stubGlobal("ResizeObserver", RecordingResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderCode(): { pre: HTMLPreElement; unmount: () => void } {
  const { container, unmount } = render(
    <ScrollableCode label={codeBlockLabel}>
      <code>echo hi</code>
    </ScrollableCode>,
  );
  const pre = container.querySelector("pre");
  if (pre === null) throw new Error("ScrollableCode rendered no pre");
  return { pre, unmount };
}

function onlyObserver(): RecordingResizeObserver {
  const [observer, ...others] = RecordingResizeObserver.instances;
  if (observer === undefined || others.length > 0) {
    throw new Error(`expected one ResizeObserver, got ${RecordingResizeObserver.instances.length}`);
  }
  return observer;
}

// jsdom has no layout, so the widths the decision reads are set on the element itself.
function setWidths(pre: HTMLPreElement, scrollWidth: number, clientWidth: number): void {
  Object.defineProperty(pre, "scrollWidth", { configurable: true, value: scrollWidth });
  Object.defineProperty(pre, "clientWidth", { configurable: true, value: clientWidth });
}

function notifyResize(observer: RecordingResizeObserver): void {
  act(() => observer.callback([], observer));
}

function scrollStopOf(pre: HTMLPreElement): (string | null)[] {
  return [pre.getAttribute("tabindex"), pre.getAttribute("role"), pre.getAttribute("aria-label")];
}

const scrollStop = ["0", "group", codeBlockLabel];
const noScrollStop = [null, null, null];

describe("ScrollableCode", () => {
  it("an overflowing pre takes tabindex 0, the group role and its name, and loses them once it fits", () => {
    const { pre } = renderCode();
    const observer = onlyObserver();

    setWidths(pre, 400, 200);
    notifyResize(observer);
    const overflowing = scrollStopOf(pre);
    setWidths(pre, 400, 400);
    notifyResize(observer);

    expect(overflowing).toEqual(scrollStop);
    expect(scrollStopOf(pre)).toEqual(noScrollStop);
  });

  it("a focused pre that stops overflowing keeps its stop until it loses focus", () => {
    const { pre } = renderCode();
    const observer = onlyObserver();
    setWidths(pre, 400, 200);
    notifyResize(observer);
    act(() => pre.focus());

    setWidths(pre, 400, 400);
    notifyResize(observer);
    const fittingWhileFocused = scrollStopOf(pre);
    const focusedWhileFitting = document.activeElement === pre;
    act(() => pre.blur());

    expect(fittingWhileFocused).toEqual(scrollStop);
    expect(focusedWhileFitting).toBe(true);
    expect(scrollStopOf(pre)).toEqual(noScrollStop);
  });

  it("unmounting disconnects the observer", () => {
    const { pre, unmount } = renderCode();
    const observer = onlyObserver();

    unmount();

    expect(observer.observed).toEqual([pre]);
    expect(observer.isDisconnected).toBe(true);
  });
});
