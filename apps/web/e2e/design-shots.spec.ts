import path from "node:path";
import { expect, test } from "@playwright/test";
import { brandName } from "../lib/copy";
import { toCatalogView } from "../lib/course/view";
import { catalogPath, lessonPath } from "../lib/routes";
import { isSwitchOn, STORAGE_STATE } from "../playwright.config";
import { fixtureCourse } from "./course";
import { trackLoadFailures, useOwnBucket, waitForHydration } from "./fixtures";

// Screenshots of the app pages #241 changes, for the design conformance check (ADR-0006 item 5), against a
// stack whose web serves an export of tests/fixtures/course-root. A file of its own, so the several-course
// run's report never counts these tests. Each shot comes from a fresh context created with its colour scheme
// and viewport, after <html> was checked to carry the `dark` class in the dark scheme only.

class NoShotsDirError extends Error {
  constructor() {
    super("E2E_DESIGN_SHOTS_DIR is not an absolute path");
    this.name = "NoShotsDirError";
  }
}

const shotsVariable = process.env.E2E_DESIGN_SHOTS_DIR;
const shotsDir =
  shotsVariable !== undefined && path.isAbsolute(shotsVariable) ? shotsVariable : undefined;
test.skip(
  !isSwitchOn("E2E_FIXTURE_COURSE_ROOT") || shotsDir === undefined,
  "needs a stack serving tests/fixtures/course-root and an absolute directory: E2E_FIXTURE_COURSE_ROOT=1 E2E_DESIGN_SHOTS_DIR=<dir>",
);

const stub = await fixtureCourse("zz-stub-course");
const [stubLesson] = toCatalogView(stub).modules.flatMap((module) => module.lessons);
if (stubLesson === undefined)
  throw new Error(`the fixture course ${stub.id} needs a visible lesson`);

const PAGES = [
  { slug: "dashboard", url: "/" },
  { slug: "catalog", url: catalogPath(stub.id) },
  { slug: "lesson", url: lessonPath(stub.id, stubLesson.id) },
  { slug: "not-found", url: lessonPath(stub.id, "no-such-lesson") },
];
const WIDTHS = [375, 1280];
const SHOT_HEIGHT = 800;
const THEMES = ["light", "dark"] as const;

for (const { slug, url } of PAGES) {
  for (const width of WIDTHS) {
    for (const theme of THEMES) {
      test(`writes ${slug}/app-${width}-${theme}.png from ${url}`, async ({ browser }) => {
        if (shotsDir === undefined) throw new NoShotsDirError();
        const context = await browser.newContext({
          colorScheme: theme,
          viewport: { width, height: SHOT_HEIGHT },
          storageState: STORAGE_STATE,
        });
        try {
          const page = await context.newPage();
          await useOwnBucket(page);
          trackLoadFailures(page);
          await page.goto(url);
          await waitForHydration(
            page.getByRole("link", { name: brandName }),
            "hydrated before the shot",
          );

          if (theme === "dark") await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/);
          else await expect(page.locator("html")).not.toHaveClass(/(^|\s)dark(\s|$)/);
          await page.screenshot({
            path: path.join(shotsDir, slug, `app-${width}-${theme}.png`),
            fullPage: true,
          });
        } finally {
          await context.close();
        }
      });
    }
  }
}
