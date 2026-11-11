"use client";

import { cn } from "cn";
import type { KeyboardEvent, ReactElement } from "react";
import { StatusIcon } from "@/components/status-icon";
import { tabsListClassName, tabsTriggerClassName } from "@/components/ui/tabs";
import {
  environmentErrorSuffix,
  environmentPaneTabLabel,
  environmentStoppedSuffix,
  lessonPaneTabLabel,
  paneSwitchLabel,
} from "@/lib/copy";
import { useLessonLayout } from "./lesson-layout-context";
import { LESSON_PANE_IDS, type LessonPane } from "./lesson-panels";

// proto.css `.pane-switch` and proto.js's switch (#106 design 2.3): below 64rem each pane starts with this tab
// list, which picks the pane shown. Hand-built rather than Radix Tabs: its tabs control the pane sections, not
// tab panels of their own, and choosing a tab focuses its twin in the other pane's list. The layout CSS hides it
// at 64rem and up. Never touches the URL.

const PANES: readonly LessonPane[] = ["lesson", "environment"];

const LABELS: Record<LessonPane, string> = {
  lesson: lessonPaneTabLabel,
  environment: environmentPaneTabLabel,
};

/** The pane a key selects from the tab `pane` (automatic activation), or null for a key the list ignores. */
function keyedPane(key: string, pane: LessonPane): LessonPane | null {
  if (key === "ArrowLeft" || key === "ArrowRight")
    return pane === "lesson" ? "environment" : "lesson";
  if (key === "Home") return "lesson";
  if (key === "End") return "environment";
  return null;
}

/** The pane switch, or nothing outside a lesson layout. */
export function PaneSwitch(): ReactElement | null {
  const layout = useLessonLayout();
  if (layout === null) return null;
  const { activePane, showPane, environmentAttention } = layout;
  const suffix =
    environmentAttention === "stopped"
      ? environmentStoppedSuffix
      : environmentAttention === "error"
        ? environmentErrorSuffix
        : null;

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, pane: LessonPane): void {
    const next = keyedPane(event.key, pane);
    if (next === null) return;
    event.preventDefault();
    showPane(next, { focusTwin: true });
  }

  return (
    <div className="pane-switch">
      <div role="tablist" aria-label={paneSwitchLabel} className={cn(tabsListClassName, "w-full")}>
        {PANES.map((pane) => (
          <button
            key={pane}
            type="button"
            role="tab"
            aria-selected={pane === activePane}
            aria-controls={LESSON_PANE_IDS[pane]}
            tabIndex={pane === activePane ? 0 : -1}
            className={cn(tabsTriggerClassName, "flex-1 justify-center")}
            onClick={() => showPane(pane, { focusTwin: true })}
            onKeyDown={(event) => onKeyDown(event, pane)}
          >
            {LABELS[pane]}
            {pane === "environment" && suffix !== null ? (
              <>
                <StatusIcon kind="destructive" />
                {/* The space is a text node of the button, not part of the span: jsdom joins inline children with
                    no separator, and dom-accessibility-api trims each child element's text, so a space inside the
                    span is dropped and the label and the suffix would run together. A whitespace-only flex item
                    is not drawn. */}{" "}
                <span className="sr-only">{suffix}</span>
              </>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
