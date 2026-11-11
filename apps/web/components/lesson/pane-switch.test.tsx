import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import type { EnvironmentAttention } from "@/components/environment/status-view";
import { environmentPaneTabLabel, lessonPaneTabLabel } from "@/lib/copy";
import { useLessonLayoutState } from "./lesson-layout";
import { LessonLayoutContext, type LessonLayoutContextValue } from "./lesson-layout-context";
import { LESSON_PANE_IDS } from "./lesson-panels";
import { PaneSwitch } from "./pane-switch";

// PS1-PS5 (#106 design 7.1): the two switches, one per pane section, under the layout's real state. jsdom has no
// layout CSS, so both switches are rendered and reachable.

let current: LessonLayoutContextValue | null = null;

/** The layout's state with its pane sections; `attention` overrides the reported attention. */
function Host({ attention }: { attention?: EnvironmentAttention | null }): ReactElement {
  const state = useLessonLayoutState();
  const value = attention === undefined ? state : { ...state, environmentAttention: attention };
  current = value;
  return (
    <LessonLayoutContext value={value}>
      <section id={LESSON_PANE_IDS.lesson} data-pane="lesson" data-testid="lesson">
        <PaneSwitch />
      </section>
      <section id={LESSON_PANE_IDS.environment} data-pane="environment" data-testid="environment">
        <PaneSwitch />
      </section>
    </LessonLayoutContext>
  );
}

function tabIn(pane: "lesson" | "environment", name: string): HTMLElement {
  return within(screen.getByTestId(pane)).getByRole("tab", { name });
}

function activePane(): string | undefined {
  return current?.activePane;
}

describe("PaneSwitch", () => {
  it("shows the environment and focuses its twin tab when Окружение is clicked (PS1)", () => {
    render(<Host />);
    expect(document.activeElement).toBe(document.body);

    fireEvent.click(tabIn("lesson", environmentPaneTabLabel));

    expect(activePane()).toBe("environment");
    expect(tabIn("environment", environmentPaneTabLabel)).toHaveFocus();
  });

  it("selects with the arrow keys, Home and End, and follows into the shown pane's list (PS2)", () => {
    render(<Host />);

    fireEvent.keyDown(tabIn("lesson", lessonPaneTabLabel), { key: "ArrowRight" });
    expect(activePane()).toBe("environment");
    expect(tabIn("environment", environmentPaneTabLabel)).toHaveFocus();

    fireEvent.keyDown(tabIn("environment", environmentPaneTabLabel), { key: "ArrowLeft" });
    expect(activePane()).toBe("lesson");
    expect(tabIn("lesson", lessonPaneTabLabel)).toHaveFocus();

    fireEvent.keyDown(tabIn("lesson", lessonPaneTabLabel), { key: "End" });
    expect(activePane()).toBe("environment");
    fireEvent.keyDown(tabIn("environment", environmentPaneTabLabel), { key: "Home" });
    expect(activePane()).toBe("lesson");
  });

  it("gives the selected tab the only tab stop in both lists (PS3)", () => {
    render(<Host />);

    fireEvent.click(tabIn("lesson", environmentPaneTabLabel));

    for (const pane of ["lesson", "environment"] as const) {
      const selected = tabIn(pane, environmentPaneTabLabel);
      const other = tabIn(pane, lessonPaneTabLabel);
      expect(selected.tabIndex, `${pane} selected`).toBe(0);
      expect(selected).toHaveAttribute("aria-selected", "true");
      expect(other.tabIndex, `${pane} other`).toBe(-1);
      expect(other).toHaveAttribute("aria-selected", "false");
    }
  });

  it("points each tab at a pane section that exists (PS4)", () => {
    render(<Host />);

    for (const tab of screen.getAllByRole("tab")) {
      const id = tab.getAttribute("aria-controls") ?? "";
      expect(document.getElementById(id), `aria-controls ${id}`).not.toBeNull();
    }
  });

  it.each([
    ["stopped", "Окружение остановлено"],
    ["error", "Окружение ошибка"],
  ] as const)(
    "names the environment tab for %s attention with a hidden icon (PS5)",
    (attention, name) => {
      render(<Host attention={attention} />);

      const tab = within(screen.getByTestId("lesson")).getByRole("tab", { name });
      expect(tab.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    },
  );

  it("names the environment tab plainly without attention, with no icon (PS5)", () => {
    render(<Host attention={null} />);

    const tab = tabIn("lesson", environmentPaneTabLabel);
    expect(tab.querySelector("svg")).toBeNull();
  });
});
