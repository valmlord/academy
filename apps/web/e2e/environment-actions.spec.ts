import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  actionsMenuLabel,
  cancelLabel,
  environmentPaneTabLabel,
  environmentRunningStatus,
  environmentStartingStatus,
  environmentStoppedStatus,
  paneSwitchLabel,
  resetConfirmLabel,
  resetDialogTitle,
  resetWorkspaceLabel,
  restartEnvironmentLabel,
  screenReaderModeLabel,
  workspaceResetNote,
} from "../lib/copy";
import { SCREEN_READER_MODE_KEY } from "../lib/environment/screen-reader-mode";
import { DESTRUCTIVE_E2E } from "../playwright.config";
import { useOwnBucket } from "./fixtures";
import {
  attachCount,
  countRows,
  ENVIRONMENT_START_TIMEOUT_MS,
  environmentStatus,
  expectOutputRow,
  pathOf,
  runInTerminal,
  terminalLessons,
  terminalRows,
  trackAttaches,
  waitForAttach,
  waitForShell,
} from "./terminal-page";

// Restart, reset, the reset dialog in a small viewport and the remembered screen reader mode end to end (#106
// design 7.4). The spec restarts and resets a working folder of the signed-in user, so it runs only on a
// disposable stack (isolated-stack.sh --e2e, CI) and skips anywhere else with the reason (design 2.8). The
// tests share one lesson's workspace, so they run in order, and each one creates the files it reads.
// The isolated stack's shell is busybox: matches are whole rendered rows or the bare error text, never a tool's
// message prefix, and never the raw socket stream, whose colour codes xterm renders away.

test.skip(!DESTRUCTIVE_E2E.isAllowed, DESTRUCTIVE_E2E.reason);
test.describe.configure({ mode: "serial" });
// Each test may wait for a workspace start (the 120 s PUT timeout) on top of a stop or a delete.
test.setTimeout(240_000);

const { environmentActions: lesson } = await terminalLessons();
const path = pathOf(lesson);

const NO_SUCH_FILE = "No such file or directory";
const STATUS_TEXTS_KEY = "__e2eEnvironmentStatusTexts";

test.beforeEach(async ({ page }) => {
  await useOwnBucket(page);
});

async function openLesson(page: Page): Promise<void> {
  trackAttaches(page);
  await page.goto(path);
  await waitForAttach(page, 0);
  await waitForShell(page);
}

function actionsTrigger(page: Page): Locator {
  return page.getByRole("button", { name: actionsMenuLabel });
}

async function openResetDialog(page: Page): Promise<Locator> {
  await actionsTrigger(page).click();
  await page.getByRole("menuitem", { name: resetWorkspaceLabel }).click();
  const dialog = page.getByRole("alertdialog", { name: resetDialogTitle });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** The dialog's own buttons: "Сбросить" is also a part of the menu item's name. */
function dialogButton(dialog: Locator, name: string): Locator {
  return dialog.getByRole("button", { name, exact: true });
}

/** Records every text the environment status takes from now on, read back by `recordedStatusTexts`. */
async function recordStatusTexts(page: Page): Promise<void> {
  await page.evaluate((key) => {
    const texts: string[] = [];
    Reflect.set(window, key, texts);
    const pane = document.getElementById("environment-pane");
    if (pane === null) throw new Error("no environment pane");
    new MutationObserver(() => {
      texts.push(pane.querySelector('[role="status"]')?.textContent ?? "");
    }).observe(pane, { childList: true, characterData: true, subtree: true });
  }, STATUS_TEXTS_KEY);
}

async function recordedStatusTexts(page: Page): Promise<string[]> {
  const texts = await page.evaluate((key): unknown => Reflect.get(window, key), STATUS_TEXTS_KEY);
  if (!Array.isArray(texts)) throw new Error("the status texts were not recorded");
  return texts.filter((text): text is string => typeof text === "string");
}

/** The rendered rows holding the bare busybox and coreutils error text. */
async function noSuchFileRows(page: Page): Promise<number> {
  return (await terminalRows(page)).filter((row) => row.includes(NO_SUCH_FILE)).length;
}

test("E-restart: the environment restarts without a stopped state and keeps the files", async ({
  page,
}) => {
  await openLesson(page);
  await runInTerminal(page, "echo keep > keep-106.txt");
  await expectOutputRow(page, "cat keep-106.txt", "keep");
  await recordStatusTexts(page);
  const attached = attachCount(page);

  await actionsTrigger(page).click();
  await page.getByRole("menuitem", { name: restartEnvironmentLabel }).click();
  await waitForAttach(page, attached);
  await waitForShell(page);

  const texts = await recordedStatusTexts(page);
  expect(
    texts.some((text) => text.includes(environmentStoppedStatus)),
    "never stopped",
  ).toBe(false);
  expect(
    texts.some((text) => text.startsWith(environmentStartingStatus)),
    "starting",
  ).toBe(true);
  await expectOutputRow(page, "cat keep-106.txt", "keep");
});

test("E-reset-cancel: Cancel keeps the folder, F6 stays in the dialog, Esc ends on Действия", async ({
  page,
}) => {
  await openLesson(page);
  await runInTerminal(page, "echo stay > stay-106.txt");

  const dialog = await openResetDialog(page);
  const cancel = dialogButton(dialog, cancelLabel);
  await expect(cancel).toBeFocused();
  await page.keyboard.press("F6");
  await expect(cancel, "F6 inside the dialog").toBeFocused();
  await page.keyboard.press("Escape");

  await expect(dialog).toBeHidden();
  await expect(actionsTrigger(page)).toBeFocused();
  await expectOutputRow(page, "cat stay-106.txt", "stay");
});

test("E-reset: the folder goes back to the lesson's files and the note says so", async ({
  page,
}) => {
  await openLesson(page);
  await runInTerminal(page, "echo gone > reset-106.txt");
  // The file exists before the reset, so its absence afterwards is the reset's doing.
  await expectOutputRow(page, "ls reset-106.txt", "reset-106.txt");
  const attached = attachCount(page);

  const dialog = await openResetDialog(page);
  await dialogButton(dialog, resetConfirmLabel).click();

  // Never waitForShell here: its whole-text match fails while the note follows the status.
  await expect(environmentStatus(page)).toHaveText(environmentRunningStatus + workspaceResetNote, {
    timeout: ENVIRONMENT_START_TIMEOUT_MS,
  });
  await expect(actionsTrigger(page)).toBeFocused();
  await waitForAttach(page, attached);
  await expect
    .poll(async () => (await terminalRows(page)).some((row) => row.trim() !== ""), {
      message: "the new shell printed its prompt",
      timeout: 30_000,
    })
    .toBe(true);
  const before = await noSuchFileRows(page);
  await runInTerminal(page, "ls reset-106.txt");
  await expect
    .poll(() => noSuchFileRows(page), { message: "ls reports no such file" })
    .toBe(before + 1);
  expect(await countRows(page, "reset-106.txt"), "the name is not listed").toBe(0);
});

test("E-dialog-small: at 320x200 the dialog's buttons are inside it and on screen", async ({
  page,
}) => {
  await openLesson(page);
  await page.setViewportSize({ width: 320, height: 200 });
  await page
    .getByRole("tablist", { name: paneSwitchLabel })
    .getByRole("tab", { name: environmentPaneTabLabel })
    .click();

  const dialog = await openResetDialog(page);
  const isInside = async (button: Locator): Promise<boolean> => {
    const box = await button.boundingBox();
    const frame = await dialog.boundingBox();
    if (box === null || frame === null) return false;
    const isInDialog =
      box.x >= frame.x &&
      box.y >= frame.y &&
      box.x + box.width <= frame.x + frame.width &&
      box.y + box.height <= frame.y + frame.height;
    const isOnScreen =
      box.x >= 0 && box.y >= 0 && box.x + box.width <= 320 && box.y + box.height <= 200;
    return isInDialog && isOnScreen;
  };
  const cancel = dialogButton(dialog, cancelLabel);
  await expect(cancel).toBeFocused();
  await expect.poll(() => isInside(cancel), { message: "Отмена in view" }).toBe(true);
  await page.keyboard.press("Tab");
  const confirm = dialogButton(dialog, resetConfirmLabel);
  await expect(confirm).toBeFocused();
  await expect.poll(() => isInside(confirm), { message: "Сбросить in view" }).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("E-sr-mode: the screen reader mode turns on, is remembered across a reload, and turns off", async ({
  page,
}) => {
  await openLesson(page);
  const accessibility = page.locator(".xterm .xterm-accessibility");
  const stored = (): Promise<string | null> =>
    page.evaluate((key) => window.localStorage.getItem(key), SCREEN_READER_MODE_KEY);

  await actionsTrigger(page).click();
  await page.getByRole("menuitemcheckbox", { name: screenReaderModeLabel }).click();
  await expect(accessibility).toHaveCount(1);
  expect(await stored()).toBe("on");

  await page.reload();
  await waitForShell(page);
  await expect(accessibility, "remembered after a reload").toHaveCount(1);

  await actionsTrigger(page).click();
  await page.getByRole("menuitemcheckbox", { name: screenReaderModeLabel }).click();
  await expect(accessibility).toHaveCount(0);
  expect(await stored()).toBe("off");
});
