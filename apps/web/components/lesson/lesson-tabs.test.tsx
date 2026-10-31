import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { taskTabLabel, theoryTabLabel } from "@/lib/copy";
import type { LessonTab } from "./lesson-panels";
import { LessonTabs } from "./lesson-tabs";

const LESSON_URL = "/courses/c/lessons/l?ref=dash#sec-2";

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

function renderTabs(initialTab: LessonTab): void {
  render(
    <LessonTabs initialTab={initialTab} theory={<p>theory text</p>} task={<p>task text</p>} />,
  );
}

describe("LessonTabs", () => {
  it("opens the tab named by the initial prop", () => {
    renderTabs("task");

    expect(screen.getByRole("tab", { name: taskTabLabel })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tabpanel")).toHaveTextContent("task text");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("id", "panel-task");
  });

  it("writes ?tab=task with replaceState, keeping the other parameters and the hash", () => {
    window.history.replaceState(null, "", LESSON_URL);
    const lengthBefore = window.history.length;
    renderTabs("theory");

    fireEvent.mouseDown(screen.getByRole("tab", { name: taskTabLabel }), { button: 0 });

    expect(screen.getByRole("tabpanel")).toHaveTextContent("task text");
    expect(window.location.pathname + window.location.search + window.location.hash).toBe(
      "/courses/c/lessons/l?ref=dash&tab=task#sec-2",
    );
    expect(window.history.length, "history length after a tab selection").toBe(lengthBefore);
  });

  it("moves the selection with the arrow keys", async () => {
    renderTabs("theory");
    const theory = screen.getByRole("tab", { name: theoryTabLabel });
    theory.focus();

    fireEvent.keyDown(theory, { key: "ArrowRight" });

    // Radix moves focus in a timeout; the focus then selects the tab (automatic activation).
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: taskTabLabel })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });
    expect(window.location.search).toBe("?tab=task");
  });
});
