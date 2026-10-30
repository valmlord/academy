import { expect, type Response, type Route, test } from "@playwright/test";
import {
  brandName,
  homeTitle,
  noReadyLessonsMessage,
  notificationsHeading,
  sessionExpiredMessage,
  signInAgainLabel,
  skipLinkLabel,
} from "../lib/copy";
import { credentials } from "./fixtures";

const PHONE_WIDTH = 375;

test("the dashboard shows the shell and the empty state for the signed-in user", async ({
  page,
  baseURL,
}) => {
  if (baseURL === undefined) throw new Error("baseURL is not configured in playwright.config.ts");
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
  await expect(page.getByText(noReadyLessonsMessage)).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveCount(0);
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

test("F6 cycles the top bar and main, Shift+F6 goes back (AC12)", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: homeTitle })).toBeVisible();

  await page.keyboard.press("F6");
  await expect(page.getByRole("link", { name: brandName })).toBeFocused();
  await page.keyboard.press("F6");
  await expect(page.locator("main#main")).toBeFocused();
  await page.keyboard.press("Shift+F6");
  await expect(page.getByRole("link", { name: brandName })).toBeFocused();
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
