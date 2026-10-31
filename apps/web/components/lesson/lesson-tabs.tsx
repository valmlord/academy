"use client";

import { type ReactElement, type ReactNode, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { lessonTabsLabel, taskTabLabel, theoryTabLabel } from "@/lib/copy";
import { LESSON_PANEL_IDS, LESSON_TRIGGER_IDS, type LessonTab, lessonTabOf } from "./lesson-panels";

export interface LessonTabsProps {
  initialTab: LessonTab;
  theory: ReactNode;
  task: ReactNode;
}

// design/pages/lesson F2.4, AC4, AC17: the tab comes from `?tab=` on arrival, and each selection replaces
// `?tab=` with history.replaceState (no new history entry), keeping the other parameters and the hash.
// Radix Tabs gives the roving tabindex, arrows, Home, End and automatic activation.
export function LessonTabs({ initialTab, theory, task }: LessonTabsProps): ReactElement {
  const [tab, setTab] = useState<LessonTab>(initialTab);

  function select(value: string): void {
    const selected = lessonTabOf(value);
    if (selected === undefined) return;
    setTab(selected);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", selected);
    // State null on purpose: Next's patched replaceState treats a state carrying its own `__NA` marker as
    // an internal call and skips syncing useSearchParams, which the sign-in-again link reads (AC17).
    window.history.replaceState(null, "", url);
  }

  return (
    <Tabs value={tab} onValueChange={select} activationMode="automatic">
      <TabsList aria-label={lessonTabsLabel}>
        <TabTrigger value="theory" label={theoryTabLabel} />
        <TabTrigger value="task" label={taskTabLabel} />
      </TabsList>
      <TabsContent
        value="theory"
        id={LESSON_PANEL_IDS.theory}
        aria-labelledby={LESSON_TRIGGER_IDS.theory}
      >
        {theory}
      </TabsContent>
      <TabsContent
        value="task"
        id={LESSON_PANEL_IDS.task}
        aria-labelledby={LESSON_TRIGGER_IDS.task}
      >
        {task}
      </TabsContent>
    </Tabs>
  );
}

function TabTrigger({ value, label }: { value: LessonTab; label: string }): ReactElement {
  return (
    <TabsTrigger
      value={value}
      id={LESSON_TRIGGER_IDS[value]}
      aria-controls={LESSON_PANEL_IDS[value]}
    >
      {label}
    </TabsTrigger>
  );
}
