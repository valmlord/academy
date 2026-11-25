import { type Browser, expect, type Locator, type Page, test } from "@playwright/test";
import {
  brandName,
  breadcrumbLabel,
  homeTitle,
  noModuleLessonsMessage,
  openCourseLabel,
  otherCoursesHeading,
} from "../lib/copy";
import type { CourseTree } from "../lib/course/read";
import { findLesson, type LessonView, toCatalogView, toLessonView } from "../lib/course/view";
import { catalogPath, lessonPath, moduleAnchorPath } from "../lib/routes";
import { isSwitchOn, STORAGE_STATE } from "../playwright.config";
import { fixtureCourse } from "./course";
import { trackLoadFailures, useOwnBucket, waitForHydration } from "./fixtures";

// The catalog and lesson pages over tests/fixtures/course-root, against a stack whose web serves an
// export of that root (compose.fixture-course-root.yaml). Titles come from the fixture through the app's own
// loader and views; the spec names its three courses by id.

test.skip(
  !isSwitchOn("E2E_FIXTURE_COURSE_ROOT"),
  "needs a stack serving tests/fixtures/course-root: E2E_FIXTURE_COURSE_ROOT=1",
);

test.beforeEach(async ({ page }) => {
  await useOwnBucket(page);
  trackLoadFailures(page);
});

const longName = await fixtureCourse("long-name-course");
const stub = await fixtureCourse("zz-stub-course");
const empty = await fixtureCourse("zzz-empty-course");

// Lesson AC76 and the catalog acceptance's layout notes check the wrap with a course name of this length.
const LONG_TITLE_LENGTH = 120;

/** The first visible lesson of `course`, as the lesson page renders it. */
function firstLessonOf(course: CourseTree): LessonView {
  const [first] = toCatalogView(course).modules.flatMap((module) => module.lessons);
  if (first === undefined)
    throw new Error(`the fixture course ${course.id} needs a visible lesson`);
  const found = findLesson(course, first.id);
  if (found === undefined) throw new Error(`the catalog lesson ${first.id} is not visible`);
  return toLessonView(course, found);
}

function otherCourses(page: Page): Locator {
  return page.getByRole("region", { name: otherCoursesHeading, exact: true });
}

function crumbs(page: Page): Locator {
  return page.getByRole("navigation", { name: breadcrumbLabel });
}

async function expectBannerLinks(page: Page, isHomeCurrent: boolean): Promise<void> {
  const banner = page.getByRole("banner");
  await expect(banner.getByRole("link")).toHaveText([brandName, homeTitle]);
  const home = banner.getByRole("link", { name: homeTitle, exact: true });
  if (isHomeCurrent) await expect(home).toHaveAttribute("aria-current", "page");
  else await expect(home).not.toHaveAttribute("aria-current", /.*/);
  await expect(banner.getByRole("link", { name: brandName, exact: true })).not.toHaveAttribute(
    "aria-current",
    /.*/,
  );
}

test("E1 the dashboard's top bar links the brand and the home page, the home page current (dashboard AC65)", async ({
  page,
}) => {
  await page.goto("/");

  await expectBannerLinks(page, true);
});

test("E2 a catalog ends with the other courses in list order and marks no top bar link current (catalog AC13, AC14)", async ({
  page,
}) => {
  await page.goto(catalogPath(longName.id));

  await expect(page).toHaveTitle(longName.title);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(longName.title);
  await expectBannerLinks(page, false);
  const lastSection = page.locator("main section").last();
  await expect(lastSection).toHaveAccessibleName(otherCoursesHeading);
  const links = lastSection.getByRole("link");
  await expect(links).toHaveText([stub.title, empty.title]);
  await expect(links.nth(0)).toHaveAttribute("href", catalogPath(stub.id));
  await expect(links.nth(1)).toHaveAttribute("href", catalogPath(empty.id));
});

test("E3 F6 lands on the first module link, and the other courses come after the lesson row in the Tab order (catalog AC11, AC14)", async ({
  page,
}) => {
  const catalog = toCatalogView(longName);
  const [module] = catalog.modules;
  const [lesson] = module?.lessons ?? [];
  if (module === undefined || lesson === undefined) {
    throw new Error(`the fixture course ${longName.id} needs a module with a visible lesson`);
  }
  await page.goto(catalogPath(longName.id));
  await waitForHydration(page.getByRole("link", { name: brandName }), "hydrated before F6");

  await page.keyboard.press("F6");
  await expect(page.getByRole("link", { name: brandName })).toBeFocused();
  await page.keyboard.press("F6");
  await expect(
    page
      .locator("main ol")
      .getByRole("link", { name: `${module.number}. ${module.title}`, exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator(`main a[href="${lessonPath(longName.id, lesson.id)}"]`)).toBeFocused();
  for (const other of [stub, empty]) {
    await page.keyboard.press("Tab");
    await expect(
      otherCourses(page).getByRole("link", { name: other.title, exact: true }),
    ).toBeFocused();
  }
});

for (const [from, to] of [
  [longName, stub],
  [stub, longName],
] as const) {
  test(`E4 from ${from.id} the other course's link and its first lesson row open its lesson (lesson AC76)`, async ({
    page,
  }) => {
    const lesson = firstLessonOf(to);
    await page.goto(catalogPath(from.id));

    await otherCourses(page).getByRole("link", { name: to.title, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(to.title);
    await page.locator(`main a[href="${lessonPath(to.id, lesson.id)}"]`).click();

    await expect(page).toHaveTitle(lesson.title);
    const crumbLinks = crumbs(page).getByRole("link");
    await expect(crumbLinks).toHaveText([to.title, lesson.module.title]);
    await expect(crumbLinks.nth(0)).toHaveAttribute("href", catalogPath(to.id));
    await expect(crumbLinks.nth(1)).toHaveAttribute(
      "href",
      moduleAnchorPath(to.id, lesson.module.id),
    );
    await expect(crumbs(page).locator('[aria-current="page"]')).toHaveText(lesson.title);
    await expect(page.getByRole("region")).toHaveCount(1);
    const courseCrumb = crumbs(page).getByRole("link", { name: to.title, exact: true });
    await waitForHydration(courseCrumb, "lesson hydrated before F6");
    await page.keyboard.press("F6");
    await expect(page.getByRole("link", { name: brandName })).toBeFocused();
    await page.keyboard.press("F6");
    await expect(courseCrumb).toBeFocused();
  });
}

test("E5 a course without ready lessons opens from the other courses and lists the other two (catalog AC14)", async ({
  page,
}) => {
  await page.goto(catalogPath(longName.id));

  await otherCourses(page).getByRole("link", { name: empty.title, exact: true }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(empty.title);
  await expect(page.getByText(noModuleLessonsMessage, { exact: true })).toBeVisible();
  await expect(otherCourses(page).getByRole("link")).toHaveText([longName.title, stub.title]);
});

/**
 * How many line boxes the link's text occupies: one client rect of a Range over its Text node per line.
 * The link box itself is no measure: the crumb's `a` is a flex item of an inline-flex `li`, so it is
 * blockified and reports one rect however many lines it takes.
 */
async function textLinesOf(link: Locator): Promise<{ isOneTextNode: boolean; lines: number }> {
  return link.evaluate((element) => {
    const [text, ...rest] = Array.from(element.childNodes);
    if (text === undefined || rest.length > 0 || text.nodeType !== Node.TEXT_NODE) {
      return { isOneTextNode: false, lines: 0 };
    }
    const range = document.createRange();
    range.selectNodeContents(text);
    return { isOneTextNode: true, lines: range.getClientRects().length };
  });
}

async function overflowOf(target: Locator): Promise<number> {
  return target.evaluate((element) => element.scrollWidth - element.clientWidth);
}

interface WrapMeasure {
  link: { isOneTextNode: boolean; lines: number };
  pageOverflow: number;
  navOverflow: number | undefined;
}

/** Opens `path` in a fresh context of `viewport` and measures `link` there; the context is always closed. */
async function measureWrap(
  browser: Browser,
  viewport: { width: number; height: number },
  path: string,
  linkOf: (page: Page) => Locator,
  hasCrumbs: boolean,
): Promise<WrapMeasure> {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    storageState: STORAGE_STATE,
  });
  try {
    const page = await context.newPage();
    await useOwnBucket(page);
    trackLoadFailures(page);
    await page.goto(path);
    const link = linkOf(page);
    await expect(link).toBeVisible();
    return {
      link: await textLinesOf(link),
      pageOverflow: await overflowOf(page.locator("html")),
      navOverflow: hasCrumbs ? await overflowOf(crumbs(page)) : undefined,
    };
  } finally {
    await context.close();
  }
}

// 640 CSS px at device scale factor 2 stands for the 1280 px viewport at 200 % zoom of the acceptance.
for (const viewport of [
  { width: 320, height: 800 },
  { width: 640, height: 400 },
]) {
  test(`E6 a ${LONG_TITLE_LENGTH}-character course name wraps in the other-course link and the course crumb at ${viewport.width}x${viewport.height}, no horizontal scroll (catalog AC12, AC14, lesson AC76)`, async ({
    browser,
  }) => {
    expect(longName.title, "the fixture's long course name").toHaveLength(LONG_TITLE_LENGTH);
    const lesson = firstLessonOf(longName);
    const byLongTitle = { name: longName.title, exact: true };

    const catalog = await measureWrap(
      browser,
      viewport,
      catalogPath(stub.id),
      (page) => otherCourses(page).getByRole("link", byLongTitle),
      false,
    );
    const lessonPage = await measureWrap(
      browser,
      viewport,
      lessonPath(longName.id, lesson.id),
      (page) => crumbs(page).getByRole("link", byLongTitle),
      true,
    );

    expect(catalog.link.isOneTextNode, "the other-course link holds one Text node").toBe(true);
    expect(catalog.link.lines, "line boxes of the other-course link").toBeGreaterThan(1);
    expect(catalog.pageOverflow, "catalog scrollWidth - clientWidth").toBe(0);
    expect(lessonPage.link.isOneTextNode, "the course crumb holds one Text node").toBe(true);
    expect(lessonPage.link.lines, "line boxes of the course crumb").toBeGreaterThan(1);
    expect(lessonPage.pageOverflow, "lesson scrollWidth - clientWidth").toBe(0);
    expect(lessonPage.navOverflow, "breadcrumb scrollWidth - clientWidth").toBe(0);
  });
}

test("E7 an unknown lesson of a fixture course is not found and offers its course (not-found AC5)", async ({
  page,
}) => {
  const response = await page.goto(lessonPath(stub.id, "no-such-lesson"));

  expect(response?.status(), "status of the not-found response").toBe(404);
  await expect(
    page.getByRole("main").getByRole("link", { name: openCourseLabel, exact: true }),
  ).toHaveAttribute("href", catalogPath(stub.id));
  await expectBannerLinks(page, false);
});
