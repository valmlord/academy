import { expect, test } from "@playwright/test";
import {
  brandName,
  homeTitle,
  lessonNotStartedLabel,
  lessonRowMeta,
  lessonTypeLabels,
  moduleAvailableLabel,
  modulePreparingLabel,
  noModuleLessonsMessage,
  outcomesHeading,
  prerequisiteNotePrefix,
  sessionExpiredMessage,
  signInAgainLabel,
} from "../lib/copy";
import { catalogPath } from "../lib/routes";
import { repoCatalog } from "./course";
import { credentials, trackLoadFailures, useOwnBucket, waitForHydration } from "./fixtures";

// Every page load reads /api/auth/get-session; with its own rate-limit bucket per test the suite never
// exhausts the shared loopback bucket that the request-fixture specs use (Better Auth limiter, always on).
test.beforeEach(async ({ page }) => {
  await useOwnBucket(page);
  trackLoadFailures(page);
});

function moduleHeading(module: { number: string; title: string }): string {
  return `${module.number}. ${module.title}`;
}

test("lists every module with its status, sections, outcomes and lesson rows (AC1, AC3, AC4)", async ({
  page,
}) => {
  const catalog = await repoCatalog();

  await page.goto(catalogPath(catalog.id));

  await expect(page).toHaveTitle(catalog.title);
  await expect(page.getByRole("heading", { level: 1, name: catalog.title })).toBeVisible();
  const moduleItems = page.locator("main ol > li");
  await expect(moduleItems).toHaveCount(catalog.modules.length);
  for (const [index, module] of catalog.modules.entries()) {
    const item = moduleItems.nth(index);
    const status = module.isAvailable ? moduleAvailableLabel : modulePreparingLabel;
    await expect(
      item.getByRole("link", { name: moduleHeading(module), exact: true }),
    ).toHaveAttribute("href", `#${module.id}`);
    await expect(item.getByText(status, { exact: true })).toBeVisible();

    const section = page.getByRole("region", { name: moduleHeading(module), exact: true });
    await expect(section.getByText(status, { exact: true })).toBeVisible();
    await expect(section.getByText(module.summary, { exact: true })).toBeVisible();
    await expect(section.getByRole("heading", { level: 3, name: outcomesHeading })).toHaveCount(
      module.outcomes.length > 0 ? 1 : 0,
    );
    const lessonList = section.getByRole("list", { name: moduleHeading(module), exact: true });
    if (module.lessons.length === 0) {
      await expect(section.getByText(noModuleLessonsMessage, { exact: true })).toBeVisible();
      await expect(lessonList, "no list in a module without visible lessons").toHaveCount(0);
      continue;
    }
    await expect(section.getByText(noModuleLessonsMessage, { exact: true })).toHaveCount(0);
    const rows = lessonList.getByRole("listitem");
    await expect(rows).toHaveCount(module.lessons.length);
    for (const [rowIndex, lesson] of module.lessons.entries()) {
      const rowLink = rows.nth(rowIndex).getByRole("link").first();
      await expect(rowLink).toContainText(`${lesson.number}. ${lesson.title}`);
      await expect(rowLink).toContainText(
        lessonRowMeta(lessonTypeLabels[lesson.type], lesson.estimatedMinutes),
      );
      await expect(rowLink).toContainText(lessonNotStartedLabel);
      await expect(rowLink).toHaveAttribute(
        "href",
        `${catalogPath(catalog.id)}/lessons/${lesson.id}`,
      );
    }
  }
});

test("a module link and a #<moduleId> arrival focus the module heading (AC2)", async ({ page }) => {
  const catalog = await repoCatalog();
  const [first, second] = catalog.modules;
  if (first === undefined || second === undefined) throw new Error("the course needs two modules");
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await page.goto(`${catalogPath(catalog.id)}#${first.id}`);
  await expect(page.locator(`#${first.id}-heading`)).toBeFocused();

  await page
    .locator("main ol")
    .getByRole("link", { name: moduleHeading(second) })
    .click();
  await expect(page.locator(`#${second.id}-heading`)).toBeFocused();
  expect(new URL(page.url()).hash).toBe(`#${second.id}`);

  await page.goto(`${catalogPath(catalog.id)}#%E0%A4`);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: catalog.title })).toBeVisible();
  expect(pageErrors.map(String), "page errors").toEqual([]);
});

test("a prerequisite note follows its row in the Tab order (AC5)", async ({ page }) => {
  const catalog = await repoCatalog();
  const lesson = catalog.modules
    .flatMap((module) => module.lessons)
    .find((candidate) => candidate.prerequisites.length > 0);
  if (lesson === undefined)
    throw new Error("the course needs a visible lesson with a prerequisite");
  const [firstPrerequisite] = lesson.prerequisites;
  if (firstPrerequisite === undefined) throw new Error("unreachable: checked above");

  await page.goto(catalogPath(catalog.id));
  const row = page
    .locator("main li")
    .filter({ has: page.getByText(`${lesson.number}. ${lesson.title}`, { exact: true }) });
  await expect(row.locator("p")).toHaveText(
    prerequisiteNotePrefix + lesson.prerequisites.map((p) => p.title).join(", "),
  );
  await row.getByRole("link").first().focus();
  await page.keyboard.press("Tab");

  await expect(row.getByRole("link", { name: firstPrerequisite.title, exact: true })).toBeFocused();
  await expect(
    row.getByRole("link", { name: firstPrerequisite.title, exact: true }),
  ).toHaveAttribute("href", `${catalogPath(catalog.id)}/lessons/${firstPrerequisite.id}`);
});

test("the top bar marks no link current, F6 reaches the first module link, no horizontal scroll (AC11, AC12, AC13)", async ({
  page,
}) => {
  const catalog = await repoCatalog();
  const [first] = catalog.modules;
  if (first === undefined) throw new Error("the course needs a module");

  await page.goto(catalogPath(catalog.id));

  const banner = page.getByRole("banner");
  await expect(banner.getByRole("link")).toHaveText([brandName, homeTitle]);
  await expect(banner.getByRole("link", { name: homeTitle, exact: true })).not.toHaveAttribute(
    "aria-current",
    /.*/,
  );
  await expect(
    banner.getByRole("button", { name: credentials().email, exact: true }),
  ).toBeVisible();
  await waitForHydration(page.getByRole("link", { name: brandName }), "hydrated before F6");
  await page.keyboard.press("F6");
  await expect(page.getByRole("link", { name: brandName })).toBeFocused();
  await page.keyboard.press("F6");
  await expect(
    page.locator("main ol").getByRole("link", { name: moduleHeading(first), exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Shift+F6");
  await expect(page.getByRole("link", { name: brandName })).toBeFocused();
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal scroll at ${width}, ${colorScheme}`).toBeLessThanOrEqual(0);
    }
  }
});

test("a rejected session fills the alert container without moving focus (AC10)", async ({
  page,
}) => {
  const catalog = await repoCatalog();
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/auth/get-session", async (route) => {
    await released;
    await route.fulfill({ status: 200, contentType: "application/json", body: "null" });
  });
  await page.goto(catalogPath(catalog.id));
  const alertContainer = page.locator('[data-notifications] > [role="alert"]');
  await expect(alertContainer).toBeEmpty();
  const [first] = catalog.modules;
  if (first === undefined) throw new Error("the course needs a module");
  const moduleLink = page.locator("main ol").getByRole("link", { name: moduleHeading(first) });
  await moduleLink.focus();

  release();

  await expect(alertContainer).toContainText(sessionExpiredMessage);
  await expect(page.getByRole("link", { name: signInAgainLabel })).toHaveAttribute(
    "href",
    `/sign-in?next=${encodeURIComponent(catalogPath(catalog.id))}`,
  );
  await expect(moduleLink).toBeFocused();
});

test("a lesson row draws the global focus ring, not a registry ring (E-ring)", async ({ page }) => {
  const catalog = await repoCatalog();
  const lastModule = catalog.modules.at(-1);
  if (lastModule === undefined) throw new Error("the course needs a module");

  await page.goto(catalogPath(catalog.id));
  await page
    .locator("main ol")
    .getByRole("link", { name: moduleHeading(lastModule) })
    .focus();
  await page.keyboard.press("Tab");

  const firstRow = page.locator("main ul[aria-labelledby] > li > a").first();
  await expect(firstRow).toBeFocused();
  const ring = await firstRow.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      isFocusVisible: element.matches(":focus-visible"),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineOffset: style.outlineOffset,
      boxShadow: style.boxShadow,
    };
  });
  expect(ring).toEqual({
    isFocusVisible: true,
    outlineStyle: "solid",
    outlineWidth: "2px",
    outlineOffset: "2px",
    boxShadow: "none",
  });
});
