"use server";

import { getDb } from "@/lib/auth";
import { getCourse } from "@/lib/course/server";
import { recordLessonStarted as writeLessonStarted } from "@/lib/progress/lesson-started";
import { getSession } from "@/lib/session";
import { mintForSession } from "@/lib/terminal/mint";
import { workspaceClient } from "@/lib/workspace/client";
import {
  createEnvironmentActions,
  type EnvironmentResult,
  type LessonStartedResult,
  type OpenTerminalResult,
} from "@/lib/workspace/environment";

// The lesson page's environment actions (#32 design 3.3 layer 1). Each passes the data access layer's session
// read in, which the logic calls first; the arguments are typed unknown because a browser can send anything.

const environment = createEnvironmentActions({
  getCourse,
  client: workspaceClient,
  mintTicket: mintForSession,
  now: () => Date.now(),
  recordStarted: (lesson) => writeLessonStarted(getDb(), lesson),
  log: (line) => console.error(line),
});

export async function peekEnvironment(
  courseId: unknown,
  lessonId: unknown,
): Promise<EnvironmentResult> {
  return environment.peekEnvironment(() => getSession(), courseId, lessonId);
}

export async function startEnvironment(
  courseId: unknown,
  lessonId: unknown,
): Promise<EnvironmentResult> {
  return environment.startEnvironment(() => getSession(), courseId, lessonId);
}

export async function openTerminal(
  courseId: unknown,
  lessonId: unknown,
): Promise<OpenTerminalResult> {
  return environment.openTerminal(() => getSession(), courseId, lessonId);
}

export async function recordLessonStarted(
  courseId: unknown,
  lessonId: unknown,
): Promise<LessonStartedResult> {
  return environment.recordLessonStarted(() => getSession(), courseId, lessonId);
}
