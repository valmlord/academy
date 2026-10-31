import { expect, type Page, test } from "@playwright/test";
import { sectionsOf } from "../components/markdown/headings";
import {
  brandName,
  breadcrumbLabel,
  copyDeniedLabel,
  copyLabel,
  courseLinkLabel,
  lessonRegionHeading,
  lessonTabsLabel,
  m0LessonNote,
  prerequisiteNotePrefix,
  signInAgainLabel,
  tableOfContentsHeading,
  taskTabLabel,
  theoryTabLabel,
} from "../lib/copy";
import { catalogPath, lessonPath } from "../lib/routes";
import { type RepoLesson, repoCatalog, repoLessons } from "./course";
import { useOwnBucket } from "./fixtures";

// Every page load reads /api/auth/get-session; with its own rate-limit bucket per test the suite never
// exhausts the shared loopback bucket that the request-fixture specs use (Better Auth limiter, always on).
test.beforeEach(async ({ page }) => {
  await useOwnBucket(page);
});

const lessons = await repoLessons();

function lessonWith(predicate: (lesson: RepoLesson) => boolean, what: string): RepoLesson {
  const lesson = lessons.find(predicate);
  if (lesson === undefined) throw new Error(`the course needs a visible lesson ${what}`);
  return lesson;
}

const firstLesson = lessonWith(() => true, "at all");
const lessonWithCode = lessonWith((lesson) => lesson.theory.includes("```"), "with a code block");
const lessonWithPrerequisite = lessonWith(
  (lesson) => lesson.view.prerequisites.length > 0,
  "with a prerequisite",
);

function pathOf(lesson: RepoLesson): string {
  return lessonPath(lesson.view.courseId, lesson.view.id);
}

function selectedTab(page: Page): Promise<string | null> {
  return page.getByRole("tab", { selected: true }).textContent();
}

/** `next` of the sign-in-again link, decoded. */
async function signInAgainNext(page: Page): Promise<string | null> {
  const href = await page.getByRole("link", { name: signInAgainLabel }).getAttribute("href");
  return href === null ? null : new URL(href, "http://x").searchParams.get("next");
}

test("open a module, open a lesson, see the theory (issue I3, AC6)", async ({ page }) => {
  const catalog = await repoCatalog();
  const module = catalog.modules.find((candidate) => candidate.id === firstLesson.view.module.id);
  const row = module?.lessons.find((candidate) => candidate.id === firstLesson.view.id);
  if (module === undefined || row === undefined)
    throw new Error("the first lesson is not in the catalog");
  const [firstSection] = sectionsOf(firstLesson.theory);
  if (firstSection === undefined) throw new Error("the first lesson's theory needs a ## section");

  await page.goto(catalogPath(catalog.id));
  await page.locator(`main ol a[href="#${module.id}"]`).click();
  await page
    .getByRole("region", { name: `${module.number}. ${module.title}`, exact: true })
    .getByRole("listitem")
    .filter({ hasText: `${row.number}. ${row.title}` })
    .getByRole("link")
    .first()
    .click();

  await expect(page.getByRole("heading", { level: 1, name: firstLesson.view.title })).toBeVisible();
  expect(await selectedTab(page)).toBe(theoryTabLabel);
  await expect(
    page.getByRole("tabpanel").getByRole("heading", { level: 2, name: firstSection.text }),
  ).toBeVisible();
});

test("?tab= picks the tab, a selection rewrites it without a history entry (AC4, AC17)", async ({
  page,
}) => {
  const path = pathOf(firstLesson);

  await page.goto(`${path}?tab=task`);
  expect(await selectedTab(page)).toBe(taskTabLabel);
  for (const unknown of ["checks", "x"]) {
    await page.goto(`${path}?tab=${unknown}`);
    expect(await selectedTab(page), `?tab=${unknown}`).toBe(theoryTabLabel);
  }
  const lengthBefore = await page.evaluate(() => window.history.length);
  await page.getByRole("tab", { name: taskTabLabel }).click();

  await expect(page.getByRole("tab", { name: taskTabLabel })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(new URL(page.url()).search).toBe("?tab=task");
  expect(await page.evaluate(() => window.history.length), "history length").toBe(lengthBefore);
  await page.reload();
  expect(await selectedTab(page)).toBe(taskTabLabel);
});

test("the sign-in-again link follows a tab selected while it is shown (AC17)", async ({ page }) => {
  const path = pathOf(firstLesson);
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "null" }),
  );

  await page.goto(path);
  await expect(page.getByRole("link", { name: signInAgainLabel })).toBeVisible();
  expect(await signInAgainNext(page)).toBe(path);
  await page.getByRole("tab", { name: taskTabLabel }).click();

  await expect
    .poll(() => signInAgainNext(page), { message: "next after selecting the task tab" })
    .toBe(`${path}?tab=task`);
});

test("the table of contents and the copy button keep ?tab= (AC18)", async ({ page }) => {
  const path = `${pathOf(lessonWithCode)}?tab=theory`;
  const [firstSection] = sectionsOf(lessonWithCode.theory);
  if (firstSection === undefined) throw new Error("the lesson's theory needs a ## section");

  await page.goto(path);
  await page
    .getByRole("navigation", { name: tableOfContentsHeading })
    .getByRole("link", { name: firstSection.text, exact: true })
    .click();

  await expect(page.locator(`#${firstSection.id}`)).toBeFocused();
  expect(new URL(page.url()).pathname + new URL(page.url()).search + new URL(page.url()).hash).toBe(
    path,
  );
  await page.getByRole("button", { name: copyLabel }).first().click();
  expect(new URL(page.url()).search).toBe("?tab=theory");
});

test("the M0 lesson: one region, the M0 line, F6 stops, no horizontal scroll (AC2, AC3, AC13)", async ({
  page,
}) => {
  await page.goto(pathOf(firstLesson));

  await expect(page.getByText(m0LessonNote, { exact: true })).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.getByRole("tablist", { name: lessonTabsLabel })).toBeVisible();
  await expect(page.getByRole("region", { name: lessonRegionHeading })).toBeVisible();
  await expect(page.getByRole("region")).toHaveCount(1);
  const crumb = page
    .getByRole("navigation", { name: breadcrumbLabel })
    .getByRole("link", { name: courseLinkLabel });

  await page.keyboard.press("F6");
  await expect(page.getByRole("link", { name: brandName })).toBeFocused();
  await page.keyboard.press("F6");
  await expect(crumb).toBeFocused();
  const regionName = await page.evaluate(() => {
    const region = document.activeElement?.closest("[data-region]");
    const labelId = region?.getAttribute("aria-labelledby");
    return labelId ? document.getElementById(labelId)?.textContent : null;
  });
  expect(regionName, "the region holding the crumb").toBe(lessonRegionHeading);
  await page.keyboard.press("F6");
  await expect(page.getByRole("link", { name: brandName })).toBeFocused();

  for (const { width, height } of [
    { width: 375, height: 667 },
    { width: 320, height: 500 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize({ width, height });
    await expect(page.getByText(m0LessonNote, { exact: true })).toBeVisible();
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth, `scrollWidth at ${width}x${height}`).toBe(width);
  }
});

test("the tab trigger and the tab panel draw the global focus ring (E-ring)", async ({ page }) => {
  await page.goto(pathOf(firstLesson));
  await page
    .getByRole("navigation", { name: breadcrumbLabel })
    .getByRole("link", { name: firstLesson.view.module.title })
    .focus();

  await page.keyboard.press("Tab");
  const trigger = page.getByRole("tab", { name: theoryTabLabel });
  await expect(trigger).toBeFocused();
  const triggerRing = await ringOf(page);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("tabpanel")).toBeFocused();
  const panelRing = await ringOf(page);

  const ring = {
    isFocusVisible: true,
    outlineStyle: "solid",
    outlineWidth: "2px",
    outlineOffset: "2px",
  };
  expect(triggerRing, "tab trigger").toEqual(ring);
  expect(panelRing, "tab panel").toEqual(ring);
});

async function ringOf(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const element = document.activeElement;
    if (element === null) return {};
    const style = getComputedStyle(element);
    return {
      isFocusVisible: element.matches(":focus-visible"),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineOffset: style.outlineOffset,
    };
  });
}

test("a refused clipboard renames the copy button and keeps focus (AC14)", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: () => Promise.reject(new Error("denied")) },
    });
  });
  await page.goto(`${pathOf(lessonWithCode)}?tab=theory`);
  const button = page.getByRole("button", { name: copyLabel }).first();
  await button.focus();

  await page.keyboard.press("Enter");

  const denied = page.getByRole("button", { name: copyDeniedLabel });
  await expect(denied).toHaveCount(1);
  await expect(denied).toBeFocused();
});

test("a prerequisite shows the warning Alert with links that open the lesson (F6.2, F6.3)", async ({
  page,
}) => {
  const { view } = lessonWithPrerequisite;
  const [prerequisite] = view.prerequisites;
  if (prerequisite === undefined) throw new Error("unreachable: checked above");

  await page.goto(pathOf(lessonWithPrerequisite));
  const alert = page.locator("main").getByText(prerequisiteNotePrefix);

  await expect(alert).toHaveText(
    prerequisiteNotePrefix + view.prerequisites.map((p) => p.title).join(", "),
  );
  const link = alert.getByRole("link", { name: prerequisite.title, exact: true });
  // design 8.4 "Links" (proto.css `a`, `a:hover`): a 0.2em offset at the Alert's text-sm, 2px on hover.
  await expect(link).toHaveCSS("text-underline-offset", "2.8px");
  await link.hover();
  await expect(link).toHaveCSS("text-decoration-thickness", "2px");
  await link.click();
  await expect(page.getByRole("heading", { level: 1, name: prerequisite.title })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(lessonPath(view.courseId, prerequisite.id));
});
