import { createDb, lessonProgress, users } from "@academy/db";
import { expect, type Page, test, type WebSocketRoute } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import {
  actionsMenuLabel,
  openHereLabel,
  openNewSessionLabel,
  regionKeyHint,
  regionKeyHintMac,
  shellExitedStatus,
  takenOverStatus,
  terminalName,
  terminalTabLabel,
} from "../lib/copy";
import { credentials, useOwnBucket } from "./fixtures";
import {
  attachCount,
  countRows,
  ENVIRONMENT_START_TIMEOUT_MS,
  environmentRegion,
  environmentStatus,
  expectOutputRow,
  isAttachedFrame,
  pathOf,
  runInTerminal,
  terminalLessons,
  terminalRows,
  trackAttaches,
  waitForAttach,
  waitForShell,
} from "./terminal-page";

// The browser terminal end to end (#32 design 10.5): one lesson, one terminal session shared by the tests in
// order, so a later test sees the shell state an earlier one left. Only with E2E_TERMINAL=1 (CI and
// isolated-stack.sh --e2e): it runs commands in a workspace and writes lesson_progress (D12).

test.skip(process.env.E2E_TERMINAL !== "1", "types into a terminal: set E2E_TERMINAL=1 (D12)");
test.describe.configure({ mode: "serial" });
// Each test may wait for a workspace start (up to two minutes) before it does anything.
test.setTimeout(240_000);

const { terminal: lesson } = await terminalLessons();
const path = pathOf(lesson);

test.beforeEach(async ({ page }) => {
  await useOwnBucket(page);
});

class MissingDatabaseUrlError extends Error {
  constructor() {
    super(
      "DATABASE_URL is not set: E-echo reads lesson_progress (CI and isolated-stack.sh --e2e set it)",
    );
    this.name = "MissingDatabaseUrlError";
  }
}

/** The seeded user's lesson_progress status for this lesson, or null without a row. */
async function progressStatus(): Promise<string | null> {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === "") throw new MissingDatabaseUrlError();
  const handle = createDb(url);
  try {
    const rows = await handle.db
      .select({ status: lessonProgress.status })
      .from(lessonProgress)
      .innerJoin(users, eq(users.id, lessonProgress.userId))
      .where(
        and(
          eq(users.email, credentials().email),
          eq(lessonProgress.courseId, lesson.view.courseId),
          eq(lessonProgress.lessonId, lesson.view.id),
        ),
      );
    return rows[0]?.status ?? null;
  } finally {
    await handle.close();
  }
}

async function openTerminalLesson(page: Page): Promise<void> {
  trackAttaches(page);
  await page.goto(path);
  await waitForAttach(page, 0);
  await waitForShell(page);
}

test("E-echo: echo ok prints ok, and the first input marks the lesson started", async ({
  page,
}) => {
  expect(await progressStatus(), "no lesson_progress row before any input").toBeNull();

  await openTerminalLesson(page);
  await expectOutputRow(page, "echo ok", "ok");

  await expect
    .poll(progressStatus, { message: "lesson_progress after the first input", timeout: 5000 })
    .toBe("in-progress");
});

test("E-size: the shell has the size of the visible frame, not 24x80", async ({ page }) => {
  const resizes: { cols: number; rows: number }[] = [];
  page.on("websocket", (socket) => {
    socket.on("framesent", ({ payload }) => {
      if (typeof payload !== "string") return;
      const frame: unknown = JSON.parse(payload);
      if (typeof frame !== "object" || frame === null) return;
      if (Reflect.get(frame, "t") !== "resize") return;
      const cols = Reflect.get(frame, "cols");
      const rows = Reflect.get(frame, "rows");
      if (typeof cols === "number" && typeof rows === "number") resizes.push({ cols, rows });
    });
  });

  await openTerminalLesson(page);
  const sent = resizes.at(-1);
  if (sent === undefined) throw new Error("the client sent no resize after attaching");
  const visibleRows = await page.locator(".xterm-rows > div").count();
  await expectOutputRow(page, "stty size", `${visibleRows} ${sent.cols}`);

  expect(sent.rows, "the resize sent equals the rows xterm draws").toBe(visibleRows);
  expect(`${visibleRows} ${sent.cols}`).not.toBe("24 80");
});

test("E-reconnect: a dropped connection resumes the same shell and screen", async ({ page }) => {
  const routes: WebSocketRoute[] = [];
  const servers: WebSocketRoute[] = [];
  let attached = 0;
  await page.routeWebSocket(/\/api\/terminal\/socket/, (route) => {
    routes.push(route);
    const server = route.connectToServer();
    servers.push(server);
    // Forwarded by hand so the test sees `attached`; the page's frames are still forwarded automatically.
    server.onMessage((message) => {
      route.send(message);
      if (isAttachedFrame(message)) attached += 1;
    });
  });

  await page.goto(path);
  await expect.poll(() => attached, { timeout: ENVIRONMENT_START_TIMEOUT_MS }).toBe(1);
  await waitForShell(page);
  await runInTerminal(page, "export T32=resumed");
  await expectOutputRow(page, "echo marker-before", "marker-before");
  const [pageSide] = routes;
  const [serverSide] = servers;
  if (pageSide === undefined || serverSide === undefined) throw new Error("no routed socket");
  await pageSide.close({ code: 4999 });
  await serverSide.close();

  await expect.poll(() => routes.length, { message: "the second routed connection" }).toBe(2);
  await expect.poll(() => attached, { message: "the second connection is attached" }).toBe(2);
  await expect.poll(() => countRows(page, "marker-before")).toBe(1);
  await expectOutputRow(page, "echo $T32", "resumed");
});

test("E-takeover: a second tab takes the session over, the first takes it back", async ({
  page,
  context,
}) => {
  await openTerminalLesson(page);
  const second = await context.newPage();
  await useOwnBucket(second);

  await openTerminalLesson(second);
  await expect(environmentStatus(page)).toHaveText(takenOverStatus);
  await expectOutputRow(second, 'echo "takeover-$T32"', "takeover-resumed");
  const attachedBefore = attachCount(page);
  await environmentRegion(page).getByRole("button", { name: openHereLabel }).click();

  await waitForAttach(page, attachedBefore);
  await expect(environmentStatus(second)).toHaveText(takenOverStatus);
});

test("E-exit: exit ends the session, a new session works", async ({ page }) => {
  await openTerminalLesson(page);

  await runInTerminal(page, "exit");
  await expect(environmentStatus(page)).toHaveText(shellExitedStatus);
  const attachedBefore = attachCount(page);
  await environmentRegion(page).getByRole("button", { name: openNewSessionLabel }).click();

  await waitForAttach(page, attachedBefore);
  // The new session's screen starts with an in-band reset (design G6); once this output shows, the old screen
  // is gone and the "ok" rows counted next are the new session's.
  await expectOutputRow(page, "echo new-session", "new-session");
  await expectOutputRow(page, "echo ok", "ok");
});

test("E-f6: the region keys never reach the shell", async ({ page }) => {
  await openTerminalLesson(page);
  const textarea = page.locator(".xterm-helper-textarea");

  await runInTerminal(page, "cat -v");
  await page.keyboard.press("F6");
  await expect(textarea).not.toBeFocused();
  await page.keyboard.press("Shift+F6");
  // The running region lands on its actions menu trigger, the first control of the status bar (AC3).
  await expect(
    environmentRegion(page).getByRole("button", { name: actionsMenuLabel }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(environmentRegion(page).getByRole("tab", { name: terminalTabLabel })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(textarea).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Control+D");

  const rows = await terminalRows(page);
  expect(rows.filter((row) => row.includes("[17~") || row.includes("[17;2~"))).toEqual([]);
});

test("E-hint: the terminal is named and described by the key hint", async ({ page }) => {
  await openTerminalLesson(page);
  const textarea = page.locator(".xterm-helper-textarea");

  await expect(textarea).toHaveAccessibleName(terminalName);
  const description = await textarea.evaluate((element) => {
    const id = element.getAttribute("aria-describedby");
    return id === null ? null : (document.getElementById(id)?.textContent ?? null);
  });
  expect([regionKeyHint, regionKeyHintMac]).toContain(description);
  // Playwright's description pads every child that is not display:inline with spaces, and each key is an
  // inline-flex Kbd, so only the characters are compared, in order, with any whitespace between them.
  await expect(textarea).toHaveAccessibleDescription(spacedPattern(description ?? ""));
});

function spacedPattern(text: string): RegExp {
  const characters = Array.from(text.replace(/\s/g, "")).map((character) =>
    character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  return new RegExp(`^${characters.join("\\s*")}$`);
}

// xterm 6.0.0 paints the theme background on its scrollable element (src/browser/Viewport.ts:74); the
// `.xterm-viewport` under it keeps xterm.css's #000, so that one is not what the learner sees.
test("E-theme: the terminal background is the --terminal token", async ({ page }) => {
  await openTerminalLesson(page);

  const colours = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (context === null) throw new Error("no 2d canvas");
    const rgb = (colour: string): number[] => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = colour;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3));
    };
    const painted = document.querySelector(".xterm-scrollable-element");
    if (painted === null) throw new Error("no .xterm-scrollable-element");
    const token = document.createElement("div");
    token.style.background = "var(--terminal)";
    document.body.append(token);
    const result = {
      terminal: rgb(getComputedStyle(painted).backgroundColor),
      token: rgb(getComputedStyle(token).backgroundColor),
    };
    token.remove();
    return result;
  });

  expect(colours.terminal).toEqual(colours.token);
});
