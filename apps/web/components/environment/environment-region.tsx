"use client";

import "@xterm/xterm/css/xterm.css";
import { Terminal } from "@xterm/xterm";
import { type ReactElement, useMemo } from "react";
import {
  openTerminal,
  peekEnvironment,
  recordLessonStarted,
  resetEnvironment,
  restartEnvironment,
  startEnvironment,
} from "@/app/(app)/courses/[courseId]/lessons/[lessonId]/actions";
import type { EnvironmentActions } from "@/lib/terminal/machine";
import { EnvironmentPanel, type TerminalFactory } from "./environment-panel";

// The real wiring of the environment panel: the lesson page's server actions bound to this lesson, and an xterm
// Terminal. Kept apart from the panel so its tests run in jsdom, which has no canvas for xterm.

export interface EnvironmentRegionProps {
  courseId: string;
  lessonId: string;
  courseHref: string;
  /** `TERMINAL_RECONNECT_ATTEMPTS`, read on the server. */
  reconnectAttempts: number;
  /** `ENVIRONMENT_START_SLOW_SECONDS`, read on the server (#32 Delta 2.1). */
  startSlowSeconds: number;
}

const createXterm: TerminalFactory = (options) => new Terminal(options);

export function EnvironmentRegion({
  courseId,
  lessonId,
  courseHref,
  reconnectAttempts,
  startSlowSeconds,
}: EnvironmentRegionProps): ReactElement {
  const actions = useMemo<EnvironmentActions>(
    () => ({
      peekEnvironment: () => peekEnvironment(courseId, lessonId),
      startEnvironment: () => startEnvironment(courseId, lessonId),
      openTerminal: () => openTerminal(courseId, lessonId),
      recordLessonStarted: () => recordLessonStarted(courseId, lessonId),
      restartEnvironment: () => restartEnvironment(courseId, lessonId),
      resetEnvironment: () => resetEnvironment(courseId, lessonId),
    }),
    [courseId, lessonId],
  );
  return (
    <EnvironmentPanel
      actions={actions}
      createTerminal={createXterm}
      courseHref={courseHref}
      reconnectAttempts={reconnectAttempts}
      startSlowSeconds={startSlowSeconds}
    />
  );
}
