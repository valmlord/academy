import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, type Page, test } from "@playwright/test";
import {
  brandName,
  courseErrorTitle,
  courseLinkLabel,
  homeTitle,
  notFoundTitle,
  openCourseLabel,
  retryLabel,
} from "../lib/copy";
import { catalogPath, lessonPath } from "../lib/routes";
import { type DockerRun, resolveStackWebContainer } from "../lib/stack-web-container";
import {
  baseURL,
  COURSE_UNREADABLE_PROJECT,
  DESTRUCTIVE_E2E,
  isSwitchOn,
} from "../playwright.config";
import { repoCatalog, repoLessons } from "./course";
import { useOwnBucket } from "./fixtures";

// The lesson and catalog pages while course.yaml cannot be read, so the course id is unknown, and the retry
// after it became readable again (#96). Each test makes the file unreadable inside the stack's web container
// with `docker exec -u 0`, so besides the switch it needs the destructive decision to allow the base URL and
// E2E_COMPOSE_PROJECT to name the stack's compose project, as CI and isolated-stack.sh --e2e set it. With the
// switch on, a gate that refuses fails every test with its reason.

test.skip(
  !isSwitchOn("E2E_COURSE_UNREADABLE"),
  "needs a disposable stack whose course the spec may make unreadable: E2E_COURSE_UNREADABLE=1",
);
// Not serial: in serial mode a failure skips the remaining tests, and with them the other outcomes.
test.describe.configure({ mode: "default" });

class CourseUnreadableRefusedError extends Error {
  constructor(reason: string) {
    super(`the destructive e2e decision refused this stack: ${reason}`);
    this.name = "CourseUnreadableRefusedError";
  }
}

class NoAcceptedContainerError extends Error {
  constructor() {
    super("no web container was accepted for this test, so its course mode cannot change");
    this.name = "NoAcceptedContainerError";
  }
}

const execFileAsync = promisify(execFile);
const docker: DockerRun = async (args) => (await execFileAsync("docker", [...args])).stdout;

// The web image copies the course export to /app/course; the glob does not depend on its directory name.
const COURSE_FILES = "/app/course/*/course.yaml";
const COURSE_ERROR_TITLE_ID = "course-error-title";
const NOT_FOUND_TITLE_ID = "not-found-title";
const CATALOG_TITLE_ID = "course-title";

const [firstLesson] = await repoLessons();
if (firstLesson === undefined) throw new Error("the course needs a visible lesson");
const catalog = await repoCatalog();

let containerId: string | undefined;
// Set before the chmod runs, so a chmod that failed halfway is still undone.
let hasChangedCourseMode = false;

test.beforeEach(async () => {
  containerId = undefined;
  if (!DESTRUCTIVE_E2E.isAllowed) throw new CourseUnreadableRefusedError(DESTRUCTIVE_E2E.reason);
  containerId = await resolveStackWebContainer(
    { hostPort: new URL(baseURL).port, expectedProject: COURSE_UNREADABLE_PROJECT },
    docker,
  );
});

test.beforeEach(async ({ page }) => {
  await useOwnBucket(page);
});

test.afterEach(async () => {
  if (!hasChangedCourseMode) return;
  hasChangedCourseMode = false;
  await chmodCourse("a+r");
});

async function chmodCourse(mode: "a-r" | "a+r"): Promise<void> {
  if (containerId === undefined) throw new NoAcceptedContainerError();
  await docker(["exec", "-u", "0", containerId, "sh", "-c", `chmod ${mode} ${COURSE_FILES}`]);
}

async function makeCourseUnreadable(): Promise<void> {
  hasChangedCourseMode = true;
  await chmodCourse("a-r");
}

/**
 * Waits until React hydrated the element, then for one idle period. Used after a goto, before the first click or
 * key press, and after U3's click that navigates, before asserting the new page's focus.
 * React marks a hydrated DOM node with an own key starting with __reactFiber$ (an internal detail).
 */
async function waitForHydration(page: Page, elementId: string): Promise<void> {
  await page.waitForFunction((id) => {
    const element = document.getElementById(id);
    return element !== null && Object.keys(element).some((key) => key.startsWith("__reactFiber$"));
  }, elementId);
  await page.evaluate(() => new Promise<void>((resolve) => requestIdleCallback(() => resolve())));
}

/** Opens `path` while the course is unreadable and waits for its course error to hydrate. */
async function openCourseError(page: Page, path: string): Promise<void> {
  await makeCourseUnreadable();
  await page.goto(path);
  await waitForHydration(page, COURSE_ERROR_TITLE_ID);
}

/** On the course error of `path`: makes the course readable again and presses Повторить. */
async function retryAfterReadable(page: Page, path: string): Promise<void> {
  await openCourseError(page, path);
  await chmodCourse("a+r");
  await page.getByRole("main").getByRole("button", { name: retryLabel }).click();
}

const lessonPathOfFirst = lessonPath(firstLesson.view.courseId, firstLesson.view.id);
const unknownLessonPath = lessonPath(catalog.id, "no-such-lesson");
const unknownCoursePath = catalogPath("no-such-course");

test("L1 a lesson whose course cannot be read shows only the course error, status 200 and the error title", async ({
  page,
}) => {
  await makeCourseUnreadable();

  const response = await page.goto(lessonPathOfFirst);

  expect(response?.status(), "status of the course error response").toBe(200);
  await expect(page).toHaveTitle(courseErrorTitle);
  const main = page.getByRole("main");
  await expect(main.getByRole("heading")).toHaveText([courseErrorTitle]);
  await expect(main.getByRole("heading", { level: 1 })).toHaveAttribute("tabindex", "-1");
  await expect(main.getByRole("button")).toHaveText([retryLabel]);
  await expect(main.getByRole("link")).toHaveCount(0);
  expect((await main.innerText()).replace(/\s/g, "")).toBe(
    `${courseErrorTitle}${retryLabel}`.replace(/\s/g, ""),
  );
  // AC19: with the course id unknown the top bar has no Курс link and marks no page as current.
  const banner = page.getByRole("banner");
  await expect(banner.getByRole("link", { name: courseLinkLabel, exact: true })).toHaveCount(0);
  await expect(banner.getByRole("link", { name: homeTitle, exact: true })).not.toHaveAttribute(
    "aria-current",
    /.*/,
  );
});

test("L2 F6 to main on the course error lands on Повторить", async ({ page }) => {
  await openCourseError(page, lessonPathOfFirst);

  await page.keyboard.press("F6");
  await expect(page.getByRole("link", { name: brandName })).toBeFocused();
  await page.keyboard.press("F6");

  await expect(page.getByRole("main").getByRole("button", { name: retryLabel })).toBeFocused();
});

test("R1 Повторить after the course became readable focuses the lesson h1", async ({ page }) => {
  await openCourseError(page, lessonPathOfFirst);
  const lessonHeading = page.getByRole("heading", { level: 1, name: firstLesson.view.title });
  await expect(lessonHeading).toHaveCount(0);
  await chmodCourse("a+r");

  await page.getByRole("main").getByRole("button", { name: retryLabel }).click();

  await expect(lessonHeading).toBeFocused();
});

test("R1t Повторить after the course became readable leaves the lesson title as <title>", async ({
  page,
}) => {
  await retryAfterReadable(page, lessonPathOfFirst);

  await expect(page.getByRole("heading", { level: 1, name: firstLesson.view.title })).toBeVisible();
  await expect(page).toHaveTitle(firstLesson.view.title);
});

test("R2 Повторить while the course is still unreadable focuses the error h1 and keeps its title", async ({
  page,
}) => {
  await openCourseError(page, lessonPathOfFirst);
  const errorHeading = page.getByRole("heading", { level: 1, name: courseErrorTitle });
  await expect(errorHeading).not.toBeFocused();

  await page.getByRole("main").getByRole("button", { name: retryLabel }).click();

  await expect(errorHeading).toBeFocused();
  await expect(page).toHaveTitle(courseErrorTitle);
});

test("R3 Повторить on an unknown lesson after the course became readable focuses the not-found h1", async ({
  page,
}) => {
  await retryAfterReadable(page, unknownLessonPath);

  await expect(page.getByRole("heading", { level: 1, name: notFoundTitle })).toBeFocused();
});

test("R3t Повторить on an unknown lesson after the course became readable leaves <title> Страница не найдена", async ({
  page,
}) => {
  await retryAfterReadable(page, unknownLessonPath);

  await expect(page.getByRole("heading", { level: 1, name: notFoundTitle })).toBeVisible();
  await expect(page).toHaveTitle(notFoundTitle);
});

test("U1 an unmatched path while the course id is unknown answers 404 without Курс or Открыть курс, and F6 lands on main", async ({
  page,
}) => {
  await makeCourseUnreadable();

  const response = await page.goto("/no/such/path");
  await waitForHydration(page, NOT_FOUND_TITLE_ID);

  expect(response?.status(), "status of the not-found response").toBe(404);
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1, name: notFoundTitle })).toBeVisible();
  await expect(
    page.getByRole("banner").getByRole("link", { name: courseLinkLabel, exact: true }),
  ).toHaveCount(0);
  await expect(main.getByRole("link", { name: openCourseLabel })).toHaveCount(0);
  // AC4: with nothing focusable in main, the second F6 focuses main itself.
  await page.keyboard.press("F6");
  await expect(page.getByRole("link", { name: brandName })).toBeFocused();
  await page.keyboard.press("F6");
  await expect(main).toBeFocused();
});

test("U2 catalog Повторить on an unknown course after the course became readable focuses the not-found h1", async ({
  page,
}) => {
  await retryAfterReadable(page, unknownCoursePath);

  await expect(page.getByRole("heading", { level: 1, name: notFoundTitle })).toBeFocused();
});

test("U2t catalog Повторить on an unknown course after the course became readable leaves <title> Страница не найдена", async ({
  page,
}) => {
  await retryAfterReadable(page, unknownCoursePath);

  await expect(page.getByRole("heading", { level: 1, name: notFoundTitle })).toBeVisible();
  await expect(page).toHaveTitle(notFoundTitle);
});

test("U3 Открыть курс after that retry opens the catalog without focusing its h1", async ({
  page,
}) => {
  await retryAfterReadable(page, unknownCoursePath);
  await expect(page.getByRole("heading", { level: 1, name: notFoundTitle })).toBeFocused();

  await page.getByRole("main").getByRole("link", { name: openCourseLabel }).click();
  await waitForHydration(page, CATALOG_TITLE_ID);

  await expect(page.getByRole("heading", { level: 1, name: catalog.title })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: catalog.title })).not.toBeFocused();
  expect(new URL(page.url()).pathname).toBe(catalogPath(catalog.id));
});
