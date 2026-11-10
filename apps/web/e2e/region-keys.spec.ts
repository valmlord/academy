import { expect, type Page, test } from "@playwright/test";
import { lessonRegionHeading } from "../lib/copy";
import { useOwnBucket } from "./fixtures";
import { pathOf, terminalLessons, waitForShell } from "./terminal-page";

// E-keys (#32 design 10.5, D10): with the terminal focused, each region key moves focus to the next or previous
// region instead of reaching the shell. Runs in Chromium, in WebKit with E2E_WEBKIT=1 and in Firefox with E2E_FIREFOX=1. Its
// own lesson, so it never takes over terminal.spec.ts's session. Only with E2E_TERMINAL=1 (D12).

test.skip(process.env.E2E_TERMINAL !== "1", "focuses a live terminal: set E2E_TERMINAL=1 (D12)");
test.setTimeout(180_000);

const { regionKeys: lesson } = await terminalLessons();

test.beforeEach(async ({ page }) => {
  await useOwnBucket(page);
  await page.goto(pathOf(lesson));
  await waitForShell(page);
  await page.locator(".xterm-screen").click();
  await expect(page.locator(".xterm-helper-textarea")).toBeFocused();
});

/** The focused element's region: the top bar's `header`, or a region named by its hidden heading. */
function focusedRegion(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const region = document.activeElement?.closest("[data-region]");
    if (region === null || region === undefined) return null;
    if (region.tagName === "HEADER") return "header";
    const labelId = region.getAttribute("aria-labelledby");
    return labelId === null ? null : (document.getElementById(labelId)?.textContent ?? null);
  });
}

// The environment region is the last of the cycle (top bar, lesson, environment), so "next" wraps to the top
// bar and "previous" is the lesson region.
for (const { key, expected } of [
  { key: "F6", expected: "header" },
  { key: "Shift+F6", expected: lessonRegionHeading },
  { key: "Control+Shift+Period", expected: "header" },
  { key: "Control+Shift+Comma", expected: lessonRegionHeading },
]) {
  test(`E-keys: ${key} moves focus out of the terminal`, async ({ page }) => {
    await page.keyboard.press(key);

    await expect.poll(() => focusedRegion(page)).toBe(expected);
  });
}
