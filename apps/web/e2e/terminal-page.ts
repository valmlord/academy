import { expect, type Locator, type Page } from "@playwright/test";
import { environmentRegionHeading, environmentRunningStatus } from "../lib/copy";
import { lessonPath } from "../lib/routes";
import { TERMINAL_SOCKET_PATH } from "../lib/terminal/protocol";
import { type RepoLesson, repoLessons } from "./course";

// Shared by the specs that drive a lesson's terminal (#32 design 10.5). Not a spec file itself, so neither
// Playwright project matches it.

/** A start creates the workspace container; the service's own PUT timeout is 120 s (ADR-0010). */
export const ENVIRONMENT_START_TIMEOUT_MS = 120_000;

export interface TerminalLessons {
  /** The last lesson: terminal.spec.ts and service-down.spec.ts. */
  terminal: RepoLesson;
  /** The one before it: region-keys.spec.ts, so the two terminal specs never share a session. */
  regionKeys: RepoLesson;
  /** The one before that: environment-actions.spec.ts, whose restart and reset touch no other spec's workspace. */
  environmentActions: RepoLesson;
}

export async function terminalLessons(): Promise<TerminalLessons> {
  const lessons = await repoLessons();
  const terminal = lessons.at(-1);
  const regionKeys = lessons.at(-2);
  const environmentActions = lessons.at(-3);
  if (terminal === undefined || regionKeys === undefined || environmentActions === undefined) {
    throw new Error("the course needs at least three visible lessons for the terminal specs");
  }
  const ids = new Set([terminal.view.id, regionKeys.view.id, environmentActions.view.id]);
  if (ids.size !== 3) {
    throw new Error("the terminal specs need three different lessons");
  }
  return { terminal, regionKeys, environmentActions };
}

export function pathOf(lesson: RepoLesson): string {
  return lessonPath(lesson.view.courseId, lesson.view.id);
}

export function environmentRegion(page: Page): Locator {
  return page.getByRole("region", { name: environmentRegionHeading });
}

export function environmentStatus(page: Page): Locator {
  return environmentRegion(page).getByRole("status");
}

/** True for the service's `attached` text frame (ADR-0011 item 6). */
export function isAttachedFrame(payload: string | Buffer): boolean {
  if (typeof payload !== "string") return false;
  try {
    const frame: unknown = JSON.parse(payload);
    return typeof frame === "object" && frame !== null && Reflect.get(frame, "t") === "attached";
  } catch {
    return false;
  }
}

const attaches = new WeakMap<Page, { count: number }>();

/**
 * Counts the `attached` frames the page's terminal sockets receive; call it before the page opens a socket. The
 * running status alone does not tell attached from connecting (both read the same, design 3.6), and keys typed
 * before `attached` are dropped (3.6.1 row 32).
 */
export function trackAttaches(page: Page): void {
  if (attaches.has(page)) return;
  const state = { count: 0 };
  attaches.set(page, state);
  page.on("websocket", (socket) => {
    if (!socket.url().includes(TERMINAL_SOCKET_PATH)) return;
    socket.on("framereceived", ({ payload }) => {
      if (isAttachedFrame(payload)) state.count += 1;
    });
  });
}

export function attachCount(page: Page): number {
  return attaches.get(page)?.count ?? 0;
}

/** Waits until the page's terminal attached more often than `since` times. */
export async function waitForAttach(page: Page, since: number): Promise<void> {
  await expect
    .poll(() => attachCount(page), {
      message: "the terminal socket is attached",
      timeout: ENVIRONMENT_START_TIMEOUT_MS,
    })
    .toBeGreaterThan(since);
}

/** The visible terminal rows as text, non-breaking spaces as spaces, trailing blanks dropped. */
export async function terminalRows(page: Page): Promise<string[]> {
  const rows = await page.locator(".xterm-rows > div").allTextContents();
  return rows.map((row) => row.replace(/\u00a0/g, " ").trimEnd());
}

export async function countRows(page: Page, text: string): Promise<number> {
  return (await terminalRows(page)).filter((row) => row === text).length;
}

/**
 * Waits for the running status and the shell's first output: binary output is written only once the socket is
 * attached, so a non-empty row means typed keys are sent rather than dropped (design 3.6.1 row 32).
 */
export async function waitForShell(page: Page): Promise<void> {
  await expect(environmentStatus(page)).toHaveText(environmentRunningStatus, {
    timeout: ENVIRONMENT_START_TIMEOUT_MS,
  });
  await expect
    .poll(async () => (await terminalRows(page)).some((row) => row.trim() !== ""), {
      message: "the shell printed its prompt",
      timeout: 30_000,
    })
    .toBe(true);
}

/** Focuses the terminal by a click (it never focuses itself) and types a line followed by Enter. */
export async function runInTerminal(page: Page, line: string): Promise<void> {
  await page.locator(".xterm-screen").click();
  await page.keyboard.type(line);
  await page.keyboard.press("Enter");
}

/** Runs a line and waits until one more row reads exactly `output` than before. */
export async function expectOutputRow(page: Page, line: string, output: string): Promise<void> {
  const before = await countRows(page, output);
  await runInTerminal(page, line);
  await expect
    .poll(() => countRows(page, output), { message: `a row reading exactly ${output}` })
    .toBe(before + 1);
}
