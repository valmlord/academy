import { expect, test } from "@playwright/test";
import {
  brandName,
  lessonRegionHeading,
  retryLabel,
  startFailedStatus,
  theoryTabLabel,
} from "../lib/copy";
import { useOwnBucket } from "./fixtures";
import {
  ENVIRONMENT_START_TIMEOUT_MS,
  environmentRegion,
  environmentStatus,
  pathOf,
  terminalLessons,
} from "./terminal-page";

// E-service-down (#32 design 10.5, D5): with the workspace service stopped, the site still serves every page and
// only the lesson's environment says the start failed. Runs only with E2E_SERVICE_DOWN=1, after the caller
// stopped the service (CI and isolated-stack.sh --e2e).

test.skip(
  process.env.E2E_SERVICE_DOWN !== "1",
  "needs the workspace service stopped: E2E_SERVICE_DOWN=1",
);

const { terminal: lesson } = await terminalLessons();

test.beforeEach(async ({ page }) => {
  await useOwnBucket(page);
});

test("E-service-down: the site works and the environment says the start failed", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: brandName })).toBeVisible();

  await page.goto(pathOf(lesson));
  await expect(page.getByRole("heading", { level: 1, name: lesson.view.title })).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: lessonRegionHeading })
      .getByRole("tab", { name: theoryTabLabel }),
  ).toBeVisible();

  await expect(environmentStatus(page)).toHaveText(startFailedStatus, {
    timeout: ENVIRONMENT_START_TIMEOUT_MS,
  });
  await expect(environmentRegion(page).getByRole("button", { name: retryLabel })).toBeVisible();
});
