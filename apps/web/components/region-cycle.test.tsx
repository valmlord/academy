import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { brandName, signInAgainLabel } from "@/lib/copy";
import { RegionCycle } from "./region-cycle";

// The dashboard's regions in DOM order; main has nothing focusable, as in the empty state.
function Page({ hasAlert }: { hasAlert: boolean }): ReactElement {
  return (
    <>
      <header data-region>
        <a href="/">{brandName}</a>
      </header>
      <div data-region data-notifications role={hasAlert ? "region" : undefined}>
        <div role="alert">
          {hasAlert ? <a href="/sign-in?next=%2F">{signInAgainLabel}</a> : null}
        </div>
      </div>
      <main data-region tabIndex={-1} data-testid="main" />
      <RegionCycle />
    </>
  );
}

// A widget with its own keydown listener (as xterm's textarea has) in the middle region.
function WidgetPage({ onWidgetKeyDown }: { onWidgetKeyDown: () => void }): ReactElement {
  return (
    <>
      <header data-region>
        <button type="button" data-testid="before">
          before
        </button>
      </header>
      <section data-region>
        <textarea aria-label="widget" onKeyDown={onWidgetKeyDown} />
      </section>
      <main data-region>
        <button type="button" data-testid="after">
          after
        </button>
      </main>
      <RegionCycle />
    </>
  );
}

function pressF6(shiftKey = false): void {
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "F6", code: "F6", shiftKey });
}

describe("RegionCycle", () => {
  it("moves from the page to the top bar, then to main, skipping empty notifications", () => {
    render(<Page hasAlert={false} />);

    pressF6();
    expect(screen.getByRole("link", { name: brandName })).toHaveFocus();
    pressF6();
    expect(screen.getByTestId("main")).toHaveFocus();
  });

  it("stops at the notifications region while it holds the alert", () => {
    render(<Page hasAlert />);

    pressF6();
    pressF6();
    expect(screen.getByRole("link", { name: signInAgainLabel })).toHaveFocus();
    pressF6();
    expect(screen.getByTestId("main")).toHaveFocus();
  });

  it("goes backwards with Shift+F6 and wraps around", () => {
    render(<Page hasAlert={false} />);

    pressF6();
    pressF6(true);
    expect(screen.getByTestId("main")).toHaveFocus();
    pressF6(true);
    expect(screen.getByRole("link", { name: brandName })).toHaveFocus();
  });

  it.each([
    { name: "F6", init: { key: "F6", code: "F6" }, target: "after" },
    { name: "Shift+F6", init: { key: "F6", code: "F6", shiftKey: true }, target: "before" },
    {
      name: "Ctrl+Shift+Period",
      init: { key: ">", code: "Period", ctrlKey: true, shiftKey: true },
      target: "after",
    },
    {
      name: "Ctrl+Shift+Comma",
      init: { key: "<", code: "Comma", ctrlKey: true, shiftKey: true },
      target: "before",
    },
  ])(
    "moves focus on $name without the focused widget's own listener seeing it (U-region-stop)",
    ({ init, target }) => {
      const ownKeyDown = vi.fn();
      render(<WidgetPage onWidgetKeyDown={ownKeyDown} />);
      const widget = screen.getByRole("textbox");
      widget.focus();

      fireEvent.keyDown(widget, init);

      expect(screen.getByTestId(target)).toHaveFocus();
      expect(ownKeyDown).not.toHaveBeenCalled();
    },
  );

  it("lets any other key reach the focused widget's own listener", () => {
    const ownKeyDown = vi.fn();
    render(<WidgetPage onWidgetKeyDown={ownKeyDown} />);
    const widget = screen.getByRole("textbox");
    widget.focus();

    fireEvent.keyDown(widget, { key: "a", code: "KeyA" });

    expect(ownKeyDown).toHaveBeenCalledTimes(1);
    expect(widget).toHaveFocus();
  });

  it("takes Ctrl+Shift+Period as F6", () => {
    render(<Page hasAlert={false} />);

    fireEvent.keyDown(document.body, { key: ">", code: "Period", ctrlKey: true, shiftKey: true });

    expect(screen.getByRole("link", { name: brandName })).toHaveFocus();
  });
});
