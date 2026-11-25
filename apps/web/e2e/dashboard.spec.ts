import { expect, type Response, type Route, test } from "@playwright/test";
import {
  brandName,
  durationLabel,
  homeTitle,
  lessonTypeLabels,
  modulePreparingLabel,
  moduleProgressLabel,
  nextLessonHeading,
  noPassedLessonsMessage,
  notificationsHeading,
  progressValueText,
  sessionExpiredMessage,
  signInAgainLabel,
  skipLinkLabel,
  startLessonLabel,
} from "../lib/copy";
import type { LessonNode, ModuleNode } from "../lib/course/read";
import { isLessonVisible } from "../lib/course/view";
import { countedCheckCount } from "../lib/progress/rules";
import { catalogPath, lessonPath } from "../lib/routes";
import { repoCourse, repoDashboard } from "./course";
import { credentials, trackLoadFailures, useOwnBucket, waitForHydration } from "./fixtures";

// Every page load reads /api/auth/get-session; with its own rate-limit bucket per test the suite never
// exhausts the shared loopback bucket that the request-fixture specs use (Better Auth limiter, always on).
test.beforeEach(async ({ page }) => {
  await useOwnBucket(page);
  trackLoadFailures(page);
});

const PHONE_WIDTH = 375;

function isCountedVisible(module: ModuleNode, node: LessonNode): boolean {
  return isLessonVisible(module, node) && countedCheckCount(node.lesson) >= 1;
}

test("the dashboard shows the first-run Card, course line and module rows (AC1, AC3, AC4)", async ({
  page,
  baseURL,
}) => {
  if (baseURL === undefined) throw new Error("baseURL is not configured in playwright.config.ts");
  const dashboard = await repoDashboard();
  // The expected Card comes from the course tree, not from toDashboardView, so a wrong choice of the next
  // lesson in the dashboard view cannot also move the expectation (AC1 as amended by D6: the first visible
  // lesson with a counted check).
  const course = await repoCourse();
  const firstModule = course.modules.find((module) =>
    module.lessons.some((node) => isCountedVisible(module, node)),
  );
  const next = firstModule?.lessons.find((node) => isCountedVisible(firstModule, node))?.lesson;
  if (firstModule === undefined || next === undefined) {
    throw new Error("the course needs a visible lesson with a counted check");
  }
  const origin = new URL(baseURL).origin;
  const responses: Response[] = [];
  // Registered before goto, so the document and every asset it loads are seen.
  page.on("response", (response) => {
    if (new URL(response.url()).origin === origin) responses.push(response);
  });

  const documentResponse = await page.goto("/");
  await page.waitForLoadState("load");

  expect(documentResponse?.ok()).toBe(true);
  await expect(page.getByRole("heading", { level: 1, name: homeTitle })).toBeVisible();
  const card = page.getByRole("region", { name: nextLessonHeading });
  await expect(card.getByText(next.title, { exact: true })).toBeVisible();
  await expect(card.getByText(firstModule.module.title, { exact: true })).toBeVisible();
  await expect(card.getByText(lessonTypeLabels[next.type], { exact: true })).toBeVisible();
  await expect(card.getByText(durationLabel(next.estimatedMinutes), { exact: true })).toBeVisible();
  await expect(card.getByRole("link", { name: startLessonLabel })).toHaveAttribute(
    "href",
    lessonPath(dashboard.courseId, next.id),
  );
  await expect(page.getByRole("heading", { level: 2, name: noPassedLessonsMessage })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: noPassedLessonsMessage })).toHaveAttribute(
    "aria-valuetext",
    progressValueText(0, dashboard.totalLessons),
  );
  const rows = page.locator("main ul > li");
  await expect(rows).toHaveCount(dashboard.modules.length);
  for (const [index, module] of dashboard.modules.entries()) {
    const link = rows.nth(index).getByRole("link");
    await expect(link).toHaveAttribute("href", `${catalogPath(dashboard.courseId)}#${module.id}`);
    await expect(link).toContainText(module.title);
    await expect(link).toContainText(
      module.isAvailable ? moduleProgressLabel(0, module.lessonCount) : modulePreparingLabel,
    );
  }
  await expect(page.getByRole("button", { name: credentials().email, exact: true })).toBeVisible();
  const staticResponses = responses.filter((r) =>
    new URL(r.url()).pathname.startsWith("/_next/static/"),
  );
  expect(staticResponses.length, "responses from /_next/static/").toBeGreaterThan(0);
  const failed = responses.filter((r) => r.status() >= 400).map((r) => `${r.status()} ${r.url()}`);
  expect(failed, "same-origin responses with status >= 400").toEqual([]);
  await page.setViewportSize({ width: PHONE_WIDTH, height: 800 });
  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(horizontalOverflow, "horizontal scroll at 375").toBeLessThanOrEqual(0);
});

test("Tab order runs through the top bar, the start button and the module rows", async ({
  page,
}) => {
  const dashboard = await repoDashboard();
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: homeTitle })).toBeVisible();
  const expected = [
    skipLinkLabel,
    brandName,
    homeTitle,
    credentials().email,
    startLessonLabel,
    ...dashboard.modules.map((module) => module.title),
  ];

  const visited: string[] = [];
  for (const name of expected) {
    await page.keyboard.press("Tab");
    const label = await page.evaluate(() => document.activeElement?.textContent ?? "");
    visited.push(label.includes(name) ? name : label);
  }

  expect(visited).toEqual(expected);
});

test("F6 cycles the top bar and the start button, Shift+F6 goes back (AC12)", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: homeTitle })).toBeVisible();
  await waitForHydration(page.getByRole("link", { name: brandName }), "hydrated before F6");

  await page.keyboard.press("F6");
  await expect(page.getByRole("link", { name: brandName })).toBeFocused();
  await page.keyboard.press("F6");
  await expect(page.getByRole("link", { name: startLessonLabel })).toBeFocused();
  await page.keyboard.press("Shift+F6");
  await expect(page.getByRole("link", { name: brandName })).toBeFocused();
});

test("a ready module row opens its catalog section with the heading focused (AC5)", async ({
  page,
}) => {
  const dashboard = await repoDashboard();
  const module = dashboard.modules.find((candidate) => candidate.isAvailable);
  if (module === undefined) throw new Error("the course needs an available module");

  await page.goto("/");
  await page.locator("main ul > li").filter({ hasText: module.title }).getByRole("link").click();

  await expect(page.locator(`#${module.id}-heading`)).toBeFocused();
  expect(new URL(page.url()).hash).toBe(`#${module.id}`);
});

test("a rejected session fills the existing alert container without moving focus (AC10)", async ({
  page,
}) => {
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/auth/get-session", async (route: Route) => {
    await released;
    await route.fulfill({ status: 200, contentType: "application/json", body: "null" });
  });
  await page.goto("/");
  // Hidden while empty, so located by attribute (getByRole skips hidden elements), and inside the
  // notifications wrapper: Next's route announcer is another role="alert".
  const alertContainer = page.locator('[data-notifications] > [role="alert"]');
  await expect(alertContainer).toHaveCount(1);
  await expect(alertContainer).toBeEmpty();
  await expect(page.getByRole("region", { name: notificationsHeading })).toHaveCount(0);
  const focusedBefore = await page.evaluate(() => document.activeElement?.tagName);

  release();

  await expect(alertContainer).toContainText(sessionExpiredMessage);
  await expect(page.getByRole("region", { name: notificationsHeading })).toBeVisible();
  await expect(page.getByRole("link", { name: signInAgainLabel })).toHaveAttribute(
    "href",
    "/sign-in?next=%2F",
  );
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe(focusedBefore);
});

test.describe("dark system", () => {
  test.use({ colorScheme: "dark" });

  test("follows the system colour scheme", async ({ page }) => {
    await page.goto("/");
    const html = page.locator("html");

    await expect(html).toHaveClass(/(^|\s)dark(\s|$)/);
    await page.emulateMedia({ colorScheme: "light" });
    await expect(html).not.toHaveClass(/(^|\s)dark(\s|$)/);
  });
});

test("skip link is the first stop and moves focus to main, which draws the inset ring", async ({
  page,
}) => {
  await page.goto("/");

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: skipLinkLabel })).toBeFocused();
  await page.keyboard.press("Enter");

  const main = page.locator("main#main");
  await expect(main).toBeFocused();
  expect(
    await main.evaluate((element) => element.matches(":focus-visible")),
    "main matches :focus-visible",
  ).toBe(true);
  const outline = await main.evaluate((element) => {
    const style = getComputedStyle(element);
    return { offset: style.outlineOffset, style: style.outlineStyle };
  });
  expect(outline.offset, "outline-offset of main").toBe("-2px");
  expect(outline.style, "outline-style of main").toBe("solid");
});
