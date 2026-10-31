import { expect, test } from "@playwright/test";
import { brandName, courseLinkLabel, homeTitle, notFoundTitle, openCourseLabel } from "../lib/copy";
import { catalogPath } from "../lib/routes";
import { repoCatalog } from "./course";
import { useOwnBucket } from "./fixtures";

// Every page load reads /api/auth/get-session; with its own rate-limit bucket per test the suite never
// exhausts the shared loopback bucket that the request-fixture specs use (Better Auth limiter, always on).
test.beforeEach(async ({ page }) => {
  await useOwnBucket(page);
});

// U-2, U-3: an unknown course, an unknown lesson and any unmatched path render (app)/not-found.tsx inside
// the signed-in shell with status 404 (design 4.Q5, D1).
const UNKNOWN_PATHS = [
  {
    kind: "unknown lesson",
    path: (courseId: string) => `${catalogPath(courseId)}/lessons/no-such-lesson`,
  },
  { kind: "unknown course", path: () => catalogPath("no-such-course") },
  { kind: "unmatched path", path: () => "/no/such/path" },
];

for (const { kind, path } of UNKNOWN_PATHS) {
  test(`an ${kind} shows the not-found page with status 404`, async ({ page }) => {
    const catalog = await repoCatalog();

    const response = await page.goto(path(catalog.id));

    expect(response?.status(), "status of the not-found response").toBe(404);
    await expect(page).toHaveTitle(notFoundTitle);
    await expect(page.getByRole("heading", { level: 1, name: notFoundTitle })).toBeVisible();
    const banner = page.getByRole("banner");
    for (const name of [homeTitle, courseLinkLabel]) {
      await expect(banner.getByRole("link", { name, exact: true })).not.toHaveAttribute(
        "aria-current",
        /.*/,
      );
    }
    await page.keyboard.press("F6");
    await expect(page.getByRole("link", { name: brandName })).toBeFocused();
    await page.keyboard.press("F6");
    const openCourse = page.getByRole("main").getByRole("link", { name: openCourseLabel });
    await expect(openCourse).toBeFocused();
    await openCourse.click();
    await expect(page.getByRole("heading", { level: 1, name: catalog.title })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(catalogPath(catalog.id));
  });
}
