import { execFile } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";
import { expect, type Locator, type Page, type Request, test } from "@playwright/test";
import {
  brandName,
  courseErrorTitle,
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
import { trackLoadFailures, useOwnBucket, waitForHydration } from "./fixtures";

// The lesson and catalog pages while course.yaml of every course cannot be read, so no course reads, and the
// retry after it became readable again (#96). Each test makes the file unreadable inside the stack's web container
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
  trackLoadFailures(page);
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

/** Opens `path` while the course is unreadable and waits for its course error to hydrate. */
async function openCourseError(page: Page, path: string): Promise<void> {
  await makeCourseUnreadable();
  await page.goto(path);
  await waitForHydration(page.locator(`#${COURSE_ERROR_TITLE_ID}`), "course error hydrated");
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
  // AC19: the top bar links the brand and the home page and marks no page as current.
  const banner = page.getByRole("banner");
  await expect(banner.getByRole("link")).toHaveText([brandName, homeTitle]);
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
  await waitForHydration(page.locator(`#${NOT_FOUND_TITLE_ID}`), "not-found page hydrated");

  expect(response?.status(), "status of the not-found response").toBe(404);
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1, name: notFoundTitle })).toBeVisible();
  await expect(page.getByRole("banner").getByRole("link")).toHaveText([brandName, homeTitle]);
  await expect(main.getByRole("link", { name: openCourseLabel })).toHaveCount(0);
  // AC4: with nothing focusable in main, the second F6 focuses main itself.
  await page.keyboard.press("F6");
  await expect(page.getByRole("link", { name: brandName })).toBeFocused();
  await page.keyboard.press("F6");
  await expect(main).toBeFocused();
});

test("U2 an unknown course while every course is unreadable answers 404 with the not-found page", async ({
  page,
}) => {
  await makeCourseUnreadable();

  const response = await page.goto(unknownCoursePath);

  // The id names no directory of the root, so no course file is read and no course error is shown.
  expect(response?.status(), "status of the not-found response").toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: notFoundTitle })).toBeVisible();
  await expect(page.getByRole("main").getByRole("button", { name: retryLabel })).toHaveCount(0);
});

test("U2t an unknown course while every course is unreadable has <title> Страница не найдена", async ({
  page,
}) => {
  await makeCourseUnreadable();

  await page.goto(unknownCoursePath);

  await expect(page.getByRole("heading", { level: 1, name: notFoundTitle })).toBeVisible();
  await expect(page).toHaveTitle(notFoundTitle);
});

test("U3 Открыть курс after the retry on an unknown lesson opens the catalog without focusing its h1", async ({
  page,
}) => {
  await retryAfterReadable(page, unknownLessonPath);
  await expect(page.getByRole("heading", { level: 1, name: notFoundTitle })).toBeFocused();

  await page.getByRole("main").getByRole("link", { name: openCourseLabel }).click();
  await waitForHydration(
    page.locator(`#${CATALOG_TITLE_ID}`),
    "catalog hydrated after the open-course click",
  );

  await expect(page.getByRole("heading", { level: 1, name: catalog.title })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: catalog.title })).not.toBeFocused();
  expect(new URL(page.url()).pathname).toBe(catalogPath(catalog.id));
});

// Longer than the move takes once the answer arrived, which the control test measures in the same run: a move
// the guard should have stopped would land inside it too.
const STAY_WINDOW_MS = 1000;
const FOCUS_CHECK_INTERVAL_MS = 100;

interface HeldRefresh {
  heldCount(): number;
  release(): void;
}

// The refresh's RSC fetch of `path`; a document load, a script or a POST server action is not it.
function isRefreshOf(request: Request, path: string): boolean {
  return (
    new URL(request.url()).pathname === path &&
    request.method() === "GET" &&
    request.resourceType() === "fetch"
  );
}

/** Holds every refresh fetch of `path` until release(); any other request of that path goes on at once. */
async function holdRefresh(page: Page, path: string): Promise<HeldRefresh> {
  let heldCount = 0;
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    (url) => url.pathname === path,
    async (route) => {
      if (!isRefreshOf(route.request(), path)) {
        await route.fallback();
        return;
      }
      heldCount += 1;
      await gate;
      await route.continue();
    },
  );
  return { heldCount: () => heldCount, release };
}

// One check per interval, not toBeFocused: that retries until it passes, so it passes on the first poll that
// sees focus there and cannot see a move later in the window; `{ timeout: 0 }` turns its timeout off rather than
// making it a single check.
async function expectFocusKept(locator: Locator, ms: number): Promise<void> {
  for (let elapsed = 0; elapsed < ms; elapsed += FOCUS_CHECK_INTERVAL_MS) {
    expect(await locator.evaluate((element) => element === document.activeElement)).toBe(true);
    await sleep(FOCUS_CHECK_INTERVAL_MS);
  }
  expect(await locator.evaluate((element) => element === document.activeElement)).toBe(true);
}

/**
 * Presses the retry button with the answer held and checks the hold caught exactly the refresh of `path`. `answerArrived`
 * settles when the released refresh's status and headers arrive, not when its body ends: Playwright's body-end wait on
 * the response does not reliably resolve after `route.continue()` of a held refresh, so waiting for it can hang the test.
 */
async function pressRetryHeld(
  page: Page,
  path: string,
  hold: HeldRefresh,
): Promise<{ answerArrived: Promise<void> }> {
  const responseDone = page.waitForResponse((response) => isRefreshOf(response.request(), path));
  await page.getByRole("main").getByRole("button", { name: retryLabel }).click();
  await expect.poll(hold.heldCount).toBe(1);
  const answerArrived = responseDone.then(() => undefined);
  return { answerArrived };
}

/** Shift+Tab from the retry button, with the answer still held: focus reaches the top bar's user menu button. */
async function shiftTabToTopBar(page: Page): Promise<Locator> {
  await page.keyboard.press("Shift+Tab");
  const userMenuButton = page.getByRole("banner").getByRole("button");
  await expect(userMenuButton).toBeFocused();
  await expect(page.getByRole("heading", { level: 1, name: courseErrorTitle })).toBeVisible();
  return userMenuButton;
}

test("a Shift+Tab to the top bar while the answer is held keeps focus there when the lesson loads (AC19, RG1)", async ({
  page,
}) => {
  await openCourseError(page, lessonPathOfFirst);
  await chmodCourse("a+r");
  const hold = await holdRefresh(page, lessonPathOfFirst);
  try {
    const { answerArrived } = await pressRetryHeld(page, lessonPathOfFirst, hold);
    const userMenuButton = await shiftTabToTopBar(page);

    hold.release();
    await answerArrived;
    await expect(
      page.getByRole("heading", { level: 1, name: firstLesson.view.title }),
    ).toBeVisible();

    await expectFocusKept(userMenuButton, STAY_WINDOW_MS);
  } finally {
    hold.release();
    await page.unrouteAll({ behavior: "ignoreErrors" });
  }
});

test("a Shift+Tab to the top bar while the answer is held keeps focus there when the course fails again (AC19, RG1)", async ({
  page,
}) => {
  await openCourseError(page, lessonPathOfFirst);
  const hold = await holdRefresh(page, lessonPathOfFirst);
  try {
    const { answerArrived } = await pressRetryHeld(page, lessonPathOfFirst, hold);
    const userMenuButton = await shiftTabToTopBar(page);

    hold.release();
    await answerArrived;

    await expectFocusKept(userMenuButton, STAY_WINDOW_MS);
  } finally {
    hold.release();
    await page.unrouteAll({ behavior: "ignoreErrors" });
  }
});

test("control: with focus left on Повторить, a held answer that fails again moves focus to the error h1 within the stay window", async ({
  page,
}) => {
  await openCourseError(page, lessonPathOfFirst);
  const hold = await holdRefresh(page, lessonPathOfFirst);
  try {
    const { answerArrived } = await pressRetryHeld(page, lessonPathOfFirst, hold);

    hold.release();
    await answerArrived;

    await expect(page.getByRole("heading", { level: 1, name: courseErrorTitle })).toBeFocused({
      timeout: STAY_WINDOW_MS,
    });
  } finally {
    hold.release();
    await page.unrouteAll({ behavior: "ignoreErrors" });
  }
});
