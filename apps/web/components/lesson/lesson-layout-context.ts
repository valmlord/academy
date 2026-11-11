"use client";

import { createContext, useContext } from "react";
import type { EnvironmentAttention } from "@/components/environment/status-view";
import type { LessonPane } from "./lesson-panels";

// What the two-pane lesson layout shares with the panes inside it (#106 design 2.2): which pane the one-pane
// mode shows, and whether the environment needs attention, which the environment switch tab names.

export interface ShowPaneOptions {
  /** Focus the same-valued tab in the newly shown pane's switch (proto.js: the twin tab). */
  focusTwin: boolean;
}

export interface LessonLayoutContextValue {
  activePane: LessonPane;
  showPane(pane: LessonPane, options?: ShowPaneOptions): void;
  environmentAttention: EnvironmentAttention | null;
  setEnvironmentAttention(attention: EnvironmentAttention | null): void;
}

export function isLessonPane(value: unknown): value is LessonPane {
  return value === "lesson" || value === "environment";
}

export const LessonLayoutContext = createContext<LessonLayoutContextValue | null>(null);

/** The layout's context, or `null` outside a lesson layout (a page without an environment, a unit test). */
export function useLessonLayout(): LessonLayoutContextValue | null {
  return useContext(LessonLayoutContext);
}
