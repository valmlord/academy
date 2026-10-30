import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
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

  it("takes Ctrl+Shift+Period as F6", () => {
    render(<Page hasAlert={false} />);

    fireEvent.keyDown(document.body, { key: ">", code: "Period", ctrlKey: true, shiftKey: true });

    expect(screen.getByRole("link", { name: brandName })).toHaveFocus();
  });
});
