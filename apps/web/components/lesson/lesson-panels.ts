// The lesson's tab values and panel ids, shared by the client tabs and the server page. A plain module:
// a constant exported from a "use client" file reaches a server component as a client reference.

import type { LessonTextKind } from "@/lib/course/text";

/** Each tab shows one lesson text, so the tab values are the text kinds. */
export type LessonTab = LessonTextKind;

/** Fixed ids, so a retry can name the panel it focuses (as the prototype's `panel-theory`). */
export const LESSON_PANEL_IDS: Record<LessonTab, string> = {
  theory: "panel-theory",
  task: "panel-task",
};

export const LESSON_TRIGGER_IDS: Record<LessonTab, string> = {
  theory: "tab-theory",
  task: "tab-task",
};

/** A `?tab=` value this release shows, or undefined (a missing, unknown or later tab such as `checks`). */
export function lessonTabOf(value: unknown): LessonTab | undefined {
  return value === "theory" || value === "task" ? value : undefined;
}

/** The two panes of the lesson layout (#106 design 2.2), the values of `data-pane` and of the one-pane switch. */
export type LessonPane = "lesson" | "environment";

/** The pane sections' ids, which the switch tabs name in `aria-controls`; the page renders the lesson one. */
export const LESSON_PANE_IDS: Record<LessonPane, string> = {
  lesson: "lesson-pane",
  environment: "environment-pane",
};
