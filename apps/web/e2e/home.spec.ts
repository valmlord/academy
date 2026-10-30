import { expect, type Response, test } from "@playwright/test";
import { homeTitle, skipLinkLabel } from "../lib/copy";
import { stubCourses } from "../lib/courses";

test("home page lists courses", async ({ page, baseURL }) => {
  if (baseURL === undefined) throw new Error("baseURL is not configured in playwright.config.ts");
  const origin = new URL(baseURL).origin;
  const responses: Response[] = [];
  // Registered before goto, so the document and every asset it loads are seen.
  page.on("response", (response) => {
    if (new URL(response.url()).origin === origin) responses.push(response);
  });

  const document = await page.goto("/");
  await page.waitForLoadState("load");

  expect(document?.ok()).toBe(true);
  await expect(page.getByRole("heading", { level: 1, name: homeTitle })).toBeVisible();
  const items = page.getByRole("listitem");
  await expect(items).toHaveCount(stubCourses.length);
  await expect(items.first()).toHaveText(stubCourses[0]?.title ?? "");
  const staticResponses = responses.filter((r) =>
    new URL(r.url()).pathname.startsWith("/_next/static/"),
  );
  expect(staticResponses.length, "responses from /_next/static/").toBeGreaterThan(0);
  const failed = responses.filter((r) => r.status() >= 400).map((r) => `${r.status()} ${r.url()}`);
  expect(failed, "same-origin responses with status >= 400").toEqual([]);
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
