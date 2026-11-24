import { expect, type Page, test } from "@playwright/test";
import {
  brandName,
  courseLinkLabel,
  homeTitle,
  notFoundSentence,
  notFoundTitle,
  openCourseLabel,
} from "../lib/copy";
import { catalogPath } from "../lib/routes";
import { repoCatalog } from "./course";
import { trackLoadFailures, useOwnBucket, waitForHydration } from "./fixtures";

// Every page load reads /api/auth/get-session; with its own rate-limit bucket per test the suite never
// exhausts the shared loopback bucket that the request-fixture specs use (Better Auth limiter, always on).
test.beforeEach(async ({ page }) => {
  await useOwnBucket(page);
  trackLoadFailures(page);
});

// U-2, U-3: an unknown course, an unknown lesson and any unmatched path render (app)/not-found.tsx inside
// the signed-in shell with status 404 (design 4.Q5, D1). Only an unknown lesson of a readable course, way (4)
// of ia.md A218-12, offers "Открыть курс"; the proxy's pathname header is what tells the page which course.
const UNKNOWN_PATHS = [
  {
    kind: "unknown lesson",
    path: (courseId: string) => `${catalogPath(courseId)}/lessons/no-such-lesson`,
    hasOpenCourse: true,
  },
  {
    kind: "unknown course's lesson",
    path: () => `${catalogPath("no-such-course")}/lessons/no-such-lesson`,
    hasOpenCourse: false,
  },
  { kind: "unknown course", path: () => catalogPath("no-such-course"), hasOpenCourse: false },
  { kind: "unmatched path", path: () => "/no/such/path", hasOpenCourse: false },
];

async function expectNotFoundPage(page: Page): Promise<void> {
  await expect(page).toHaveTitle(notFoundTitle);
  const heading = page.getByRole("heading", { level: 1, name: notFoundTitle });
  await expect(heading).toBeVisible();
  await expect(heading).toHaveAttribute("tabindex", "-1");
  // AC2: the h1, the one sentence and at most "Открыть курс", nothing else in main.
  const main = page.getByRole("main");
  await expect(main.locator("p")).toHaveText([notFoundSentence]);
  await expect(main.getByRole("alert")).toHaveCount(0);
  await expect(main.locator("svg, img")).toHaveCount(0);
  const banner = page.getByRole("banner");
  for (const name of [homeTitle, courseLinkLabel]) {
    await expect(banner.getByRole("link", { name, exact: true })).not.toHaveAttribute(
      "aria-current",
      /.*/,
    );
  }
}

for (const { kind, path, hasOpenCourse } of UNKNOWN_PATHS) {
  test(`an ${kind} shows the not-found page with status 404, ${hasOpenCourse ? "with" : "without"} Открыть курс`, async ({
    page,
  }) => {
    const catalog = await repoCatalog();

    const response = await page.goto(path(catalog.id));

    expect(response?.status(), "status of the not-found response").toBe(404);
    await expectNotFoundPage(page);
    const main = page.getByRole("main");
    const openCourse = main.getByRole("link", { name: openCourseLabel });
    await waitForHydration(page.getByRole("link", { name: brandName }), "hydrated before F6");
    await page.keyboard.press("F6");
    await expect(page.getByRole("link", { name: brandName })).toBeFocused();
    await page.keyboard.press("F6");
    if (!hasOpenCourse) {
      // AC4: with nothing focusable in main, the second F6 focuses main itself.
      await expect(openCourse).toHaveCount(0);
      await expect(main).toBeFocused();
      return;
    }
    await expect(openCourse).toBeFocused();
    await openCourse.click();
    await expect(page.getByRole("heading", { level: 1, name: catalog.title })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(catalogPath(catalog.id));
  });
}

for (const courseId of ["A%20B", "..%2Fcourse-b"]) {
  test(`a course id ${courseId} outside the id form answers 404 without Открыть курс`, async ({
    page,
  }) => {
    const response = await page.goto(catalogPath(courseId));

    expect(response?.status(), "status of the not-found response").toBe(404);
    await expectNotFoundPage(page);
    await expect(page.getByRole("main").getByRole("link", { name: openCourseLabel })).toHaveCount(
      0,
    );
  });
}

test("an ordinary arrival at the not-found page leaves focus where the browser puts it", async ({
  page,
}) => {
  await page.goto("/no/such/path");

  // FocusOnAnyRetry, the h1's focus effect, must run before the asserts, or they could not fail.
  const heading = page.getByRole("heading", { level: 1, name: notFoundTitle });
  await waitForHydration(heading, "hydrated before the focus read");

  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("BODY");
  await expect(heading).not.toBeFocused();
});

test("the sentence sits 16px between the h1 and Открыть курс, with no horizontal scroll", async ({
  page,
}) => {
  const catalog = await repoCatalog();
  await page.goto(`${catalogPath(catalog.id)}/lessons/no-such-lesson`);
  const main = page.getByRole("main");
  const heading = main.getByRole("heading", { level: 1, name: notFoundTitle });
  const sentence = main.locator("p");
  const openCourse = main.getByRole("link", { name: openCourseLabel });
  await expect(openCourse).toBeVisible();

  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    const headingBox = await heading.boundingBox();
    const sentenceBox = await sentence.boundingBox();
    const openCourseBox = await openCourse.boundingBox();
    if (headingBox === null || sentenceBox === null || openCourseBox === null) {
      throw new Error(
        `not-found layout at ${width}: the h1, the sentence or Открыть курс has no box`,
      );
    }

    expect(
      Math.round(sentenceBox.y - (headingBox.y + headingBox.height)),
      `h1 to sentence at ${width}`,
    ).toBe(16);
    expect(
      Math.round(openCourseBox.y - (sentenceBox.y + sentenceBox.height)),
      `sentence to Открыть курс at ${width}`,
    ).toBe(16);
    expect(openCourseBox.width, `Открыть курс narrower than the sentence at ${width}`).toBeLessThan(
      sentenceBox.width,
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `horizontal scroll at ${width}`).toBeLessThanOrEqual(0);
  }
});
