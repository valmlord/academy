import { expect, type Locator, type Page, test } from "@playwright/test";
import { splitRange } from "../components/lesson/split";
import { sectionsOf } from "../components/markdown/headings";
import {
  actionsMenuLabel,
  brandName,
  breadcrumbLabel,
  copyDeniedLabel,
  copyLabel,
  courseLinkLabel,
  environmentPaneTabLabel,
  environmentRegionHeading,
  environmentTabsLabel,
  lessonPaneTabLabel,
  lessonRegionHeading,
  lessonTabsLabel,
  m0LessonNote,
  paneSwitchLabel,
  prerequisiteNotePrefix,
  signInAgainLabel,
  splitHandleLabel,
  splitHandleTooltip,
  tableOfContentsHeading,
  taskTabLabel,
  terminalTabLabel,
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

/** The selected tab of the lesson's own tab list (the environment region has a tab list too). */
function selectedTab(page: Page): Promise<string | null> {
  return page
    .getByRole("tablist", { name: lessonTabsLabel })
    .getByRole("tab", { selected: true })
    .textContent();
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

// Every lesson of the course has a `workspace`, so the page has the environment region (#32 design 3.6, 10.5).
// Nothing is typed into the terminal: plain `pnpm test:e2e` must not run commands in a workspace (D12).
test("the lesson with its environment: two regions, F6 stops, no horizontal scroll (AC1, AC3, AC13)", async ({
  page,
}) => {
  await page.goto(pathOf(firstLesson));

  const lessonRegion = page.getByRole("region", { name: lessonRegionHeading });
  const environmentRegion = page.getByRole("region", { name: environmentRegionHeading });
  await expect(lessonRegion).toBeVisible();
  await expect(environmentRegion).toBeVisible();
  await expect(page.getByRole("region")).toHaveCount(2);
  await expect(page.getByText(m0LessonNote, { exact: true })).toHaveCount(0);
  await expect(
    lessonRegion.getByRole("tablist", { name: lessonTabsLabel }).getByRole("tab"),
  ).toHaveCount(2);
  await expect(
    environmentRegion.getByRole("tablist", { name: environmentTabsLabel }).getByRole("tab"),
  ).toHaveText([terminalTabLabel]);
  const crumb = page
    .getByRole("navigation", { name: breadcrumbLabel })
    .getByRole("link", { name: courseLinkLabel });

  await page.keyboard.press("F6");
  await expect(page.getByRole("link", { name: brandName })).toBeFocused();
  await page.keyboard.press("F6");
  await expect(crumb).toBeFocused();
  expect(await focusedRegionName(page), "the region holding the crumb").toBe(lessonRegionHeading);
  await page.keyboard.press("F6");
  expect(await focusedRegionName(page), "the third F6 stop").toBe(environmentRegionHeading);
  await page.keyboard.press("F6");
  await expect(page.getByRole("link", { name: brandName })).toBeFocused();

  // Below 64rem one pane shows at a time (#106 design 2.2): the switch brings in the other one.
  for (const { width, height } of [
    { width: 375, height: 667 },
    { width: 320, height: 500 },
  ]) {
    await page.setViewportSize({ width, height });
    await page.reload();
    await expect(lessonRegion).toBeVisible();
    await expect(environmentRegion).toBeHidden();
    expect(await scrollWidthOf(page), `scrollWidth at ${width}x${height}, lesson`).toBe(width);
    await lessonRegion.getByRole("tab", { name: environmentPaneTabLabel }).click();
    await expect(environmentRegion).toBeVisible();
    await expect(lessonRegion).toBeHidden();
    expect(await scrollWidthOf(page), `scrollWidth at ${width}x${height}, environment`).toBe(width);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(lessonRegion).toBeVisible();
  await expect(environmentRegion).toBeVisible();
  expect(await scrollWidthOf(page), "scrollWidth at 1280x800").toBe(1280);
});

function scrollWidthOf(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth);
}

/** The hidden heading of the `[data-region]` that holds focus. */
function focusedRegionName(page: Page): Promise<string | null | undefined> {
  return page.evaluate(() => {
    const region = document.activeElement?.closest("[data-region]");
    const labelId = region?.getAttribute("aria-labelledby");
    return labelId ? document.getElementById(labelId)?.textContent : null;
  });
}

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
  await expect(
    page.getByRole("region", { name: lessonRegionHeading }).getByRole("tabpanel"),
  ).toBeFocused();
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

// #106 design 7.4: the two-pane layout. jsdom has no layout, so the cascade, the sizes and the pointer rules are
// checked here; nothing is typed into a terminal.

function separator(page: Page): Locator {
  return page.getByRole("separator", { name: splitHandleLabel });
}

function pane(page: Page, which: "lesson" | "environment"): Locator {
  return page.locator(`#${which}-pane`);
}

/** The shown pane's switch tab `name` (the hidden pane's switch is out of the accessibility tree). */
function switchTab(page: Page, name: string): Locator {
  return page
    .getByRole("tablist", { name: paneSwitchLabel })
    .getByRole("tab", { name, exact: true });
}

interface FrameSizes {
  frameWidth: number;
  contentWidth: number;
  paneScrollWidth: number;
  paneClientWidth: number;
  paneScrollHeight: number;
  paneClientHeight: number;
  parentWidth: number;
  parentHeight: number;
  screenWidth: number;
  screenHeight: number;
}

/** Every size of the terminal's boxes from one layout; a hidden pane is measured too (design 7.4). */
function frameSizes(page: Page): Promise<FrameSizes> {
  return page.evaluate(measureFrame);
}

function measureFrame(): FrameSizes {
  const frame = document.querySelector<HTMLElement>("[data-terminal-frame]");
  const content = frame?.parentElement;
  const environment = document.getElementById("environment-pane");
  const screen = frame?.querySelector(".xterm-screen");
  const parent = screen?.closest(".xterm")?.parentElement;
  if (!frame || !content || !environment || !screen || !parent)
    throw new Error("no terminal frame");
  const contentStyle = getComputedStyle(content);
  const screenBox = screen.getBoundingClientRect();
  return {
    frameWidth: frame.getBoundingClientRect().width,
    contentWidth:
      content.clientWidth -
      Number.parseFloat(contentStyle.paddingLeft) -
      Number.parseFloat(contentStyle.paddingRight),
    paneScrollWidth: environment.scrollWidth,
    paneClientWidth: environment.clientWidth,
    paneScrollHeight: environment.scrollHeight,
    paneClientHeight: environment.clientHeight,
    parentWidth: parent.clientWidth,
    parentHeight: parent.clientHeight,
    screenWidth: screenBox.width,
    screenHeight: screenBox.height,
  };
}

/** W1: the frame fills its row, the pane does not scroll sideways, and xterm is fitted to the frame. */
function isFitted(sizes: FrameSizes): boolean {
  const slack = sizes.parentWidth - sizes.screenWidth;
  return (
    Math.abs(sizes.frameWidth - sizes.contentWidth) <= 1 &&
    sizes.paneScrollWidth === sizes.paneClientWidth &&
    slack >= 0 &&
    slack < FITTED_SLACK_PX
  );
}

// Less than one cell (under 10 px at the frame's 14 px mono font) plus FitAddon's 14 px scrollbar allowance; a
// collapsing fit leaves hundreds of pixels, an overflowing one a negative value.
const FITTED_SLACK_PX = 40;

async function expectFitted(page: Page, what: string): Promise<void> {
  await expect.poll(async () => isFitted(await frameSizes(page)), { message: what }).toBe(true);
}

/** Focuses the lesson pane's last drawn focusable element, so the next Tab leaves the pane. */
async function focusLastInLessonPane(page: Page): Promise<void> {
  const isFocused = await page.evaluate(() => {
    const candidates = Array.from(
      document
        .getElementById("lesson-pane")
        ?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex="0"]') ?? [],
    ).filter((element) => element.checkVisibility({ visibilityProperty: true }));
    const last = candidates.at(-1);
    last?.focus();
    return last !== undefined && document.activeElement === last;
  });
  expect(isFocused, "the lesson pane's last focusable has focus").toBe(true);
}

async function splitValue(page: Page): Promise<string | null> {
  return separator(page).getAttribute("aria-valuenow");
}

/** The grip's centre, where a press on the handle lands. */
async function gripCentre(page: Page): Promise<{ x: number; y: number }> {
  const box = await separator(page).boundingBox();
  if (box === null) throw new Error("the separator is not laid out");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function pressHandle(page: Page, dx: number): Promise<void> {
  const { x, y } = await gripCentre(page);
  await page.mouse.move(x, y);
  await page.mouse.down();
  if (dx !== 0) await page.mouse.move(x + dx, y);
  await page.mouse.up();
}

test("E-layout: two panes from 64rem, one pane with the switch below, the URL kept (A8, AC18)", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${pathOf(firstLesson)}?tab=task`);
  const url = page.url();

  await expect(separator(page)).toHaveAttribute("aria-valuenow", "50");
  await expect(page.locator(".pane-switch")).toHaveCount(2);
  for (const paneSwitch of await page.locator(".pane-switch").all()) {
    await expect(paneSwitch).toBeHidden();
  }
  expect(await page.evaluate(() => document.documentElement.scrollHeight), "scrollHeight").toBe(
    800,
  );
  const mainBox = await page.locator("main#main").boundingBox();
  const environmentBox = await pane(page, "environment").boundingBox();
  expect(
    Math.abs((environmentBox?.height ?? 0) - (mainBox?.height ?? -10)),
    "pane height",
  ).toBeLessThanOrEqual(1);
  await pressHandle(page, 0);
  await page.getByRole("button", { name: actionsMenuLabel }).click();
  await page.keyboard.press("Escape");
  expect(page.url(), "URL after a handle click and the menu").toBe(url);

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await testInfo.attach(`lesson-1280-${colorScheme}`, {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  }
  await page.emulateMedia({ colorScheme: "light" });

  for (const width of [1023, 768, 375, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(separator(page), `separator at ${width}`).toBeHidden();
    await expect(switchTab(page, lessonPaneTabLabel), `switch at ${width}`).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(pane(page, "environment")).toBeHidden();
    await switchTab(page, environmentPaneTabLabel).click();
    await expect(pane(page, "environment")).toBeVisible();
    await expect(pane(page, "lesson")).toBeHidden();
    await switchTab(page, lessonPaneTabLabel).click();
    await expect(pane(page, "lesson")).toBeVisible();
    expect(page.url(), `URL after the switch at ${width}`).toBe(url);
  }
  await page.setViewportSize({ width: 375, height: 800 });
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await testInfo.attach(`lesson-375-${colorScheme}`, {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  }

  await page.setViewportSize({ width: 320, height: 200 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollHeight), {
      message: "a short viewport scrolls as one document",
    })
    .toBeGreaterThan(200);
});

test("E-layout cascade: the unlayered layout rules beat utilities, the hidden pane is out of reach", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(pathOf(firstLesson));

  await expect(separator(page)).toBeHidden();
  await focusLastInLessonPane(page);
  await page.keyboard.press("Tab");
  const landing = await page.evaluate(() => ({
    isSeparator: document.activeElement?.getAttribute("role") === "separator",
    isInEnvironment: document.getElementById("environment-pane")?.contains(document.activeElement),
  }));
  expect(landing, "Tab after the lesson pane").toEqual({
    isSeparator: false,
    isInEnvironment: false,
  });

  // A cascade layer name is document-wide, so these join Tailwind's utilities layer.
  await page.addStyleTag({
    content:
      "@layer utilities { .e2e-probe-display { display: flex } .e2e-probe-visible { visibility: visible } }",
  });
  const probes = await page.evaluate(() => {
    const handle = document.querySelector('[role="separator"]');
    handle?.classList.add("e2e-probe-display");
    const span = document.createElement("span");
    span.className = "e2e-probe-visible";
    span.textContent = "probe";
    document.querySelector("#environment-pane [role='status']")?.parentElement?.append(span);
    return {
      display: handle === null ? null : getComputedStyle(handle).display,
      visibility: getComputedStyle(span).visibility,
    };
  });
  expect(probes, "layer probes").toEqual({ display: "none", visibility: "hidden" });
});

test("E-layout frame: 12rem high in short viewports, hidden or shown", async ({ page }) => {
  const frameHeight = (): Promise<number> =>
    page.evaluate(
      () => document.querySelector("[data-terminal-frame]")?.getBoundingClientRect().height ?? 0,
    );
  await page.setViewportSize({ width: 1280, height: 400 });
  await page.goto(pathOf(firstLesson));
  await expect.poll(frameHeight, { message: "1280x400" }).toBe(192);

  await page.setViewportSize({ width: 375, height: 400 });
  await expect.poll(frameHeight, { message: "375x400, hidden" }).toBe(192);
  await switchTab(page, environmentPaneTabLabel).click();
  await expect.poll(frameHeight, { message: "375x400, shown" }).toBe(192);
});

test("E-layout sizing: the terminal fits its frame at every size, narrows and shrinks (W1, W2, H1)", async ({
  page,
}) => {
  await page.goto(pathOf(firstLesson));
  for (const { width, height } of [
    { width: 1280, height: 800 },
    { width: 1280, height: 400 },
    { width: 375, height: 400 },
    { width: 320, height: 200 },
  ]) {
    await page.setViewportSize({ width, height });
    if (width < 1024) await switchTab(page, environmentPaneTabLabel).click();
    await expectFitted(page, `W1 at ${width}x${height}`);
    await page.reload();
  }

  await page.setViewportSize({ width: 1280, height: 800 });
  await expectFitted(page, "W1 before W2");
  // getBoundingClientRect lays out at once, while the panel's ResizeObserver runs only at the next rendering
  // update, so this reads the frame before xterm is refitted (73 % is the largest split at 1280, S2).
  const narrowed = await page.evaluate(() => {
    document.getElementById("main")?.style.setProperty("--split-left", "73%");
    const frame = document.querySelector<HTMLElement>("[data-terminal-frame]");
    const content = frame?.parentElement;
    const environment = document.getElementById("environment-pane");
    if (!frame || !content || !environment) throw new Error("no terminal frame");
    const style = getComputedStyle(content);
    const contentWidth =
      content.clientWidth -
      Number.parseFloat(style.paddingLeft) -
      Number.parseFloat(style.paddingRight);
    return {
      isFrameInRow: Math.abs(frame.getBoundingClientRect().width - contentWidth) <= 1,
      isPaneUnscrolled: environment.scrollWidth === environment.clientWidth,
    };
  });
  expect(narrowed, "W2 before the refit").toEqual({ isFrameInRow: true, isPaneUnscrolled: true });
  await expectFitted(page, "W1 after W2");
  await page.reload();

  await expectFitted(page, "W1 before H1");
  await page.setViewportSize({ width: 1280, height: 600 });
  await expect
    .poll(
      async () => {
        const sizes = await frameSizes(page);
        return (
          sizes.paneScrollHeight === sizes.paneClientHeight &&
          sizes.screenHeight <= sizes.parentHeight
        );
      },
      { message: "H1: the terminal shrinks with the window" },
    )
    .toBe(true);
});

test("E-split: clicks cycle the presets, a drag moves the split, keys step it (F9.3)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(pathOf(firstLesson));

  for (const expected of ["35", "65", "50"]) {
    await pressHandle(page, 0);
    expect(await splitValue(page), "click cycle").toBe(expected);
  }
  await page.reload();
  await pressHandle(page, 3);
  expect(await splitValue(page), "a 3 px press is a click").toBe("35");
  await page.reload();
  await pressHandle(page, 4);
  expect(await splitValue(page), "a 4 px press is a drag").toBe("50");
  await page.reload();
  await pressHandle(page, 100);
  const dragged = await splitValue(page);
  expect(["50", "35", "65"], `a 100 px drag gives no preset (${dragged})`).not.toContain(dragged);
  await pressHandle(page, 0);
  expect(await splitValue(page), "a click after a drag").toBe("50");
  await page.reload();
  const { x, y } = await gripCentre(page);
  await page.mouse.dblclick(x, y);
  expect(
    await splitValue(page),
    "a double click at one spot cycles once: the second press lands where the handle was",
  ).toBe("35");
  await page.reload();
  await pressHandle(page, 0);
  await pressHandle(page, 0);
  await separator(page).dispatchEvent("dblclick");
  expect(await splitValue(page), "a double click on the handle cycles twice and never resets").toBe(
    "65",
  );

  await page.reload();
  await separator(page).focus();
  await page.keyboard.press("ArrowRight");
  expect(await splitValue(page), "ArrowRight").toBe("55");
  await page.keyboard.press("Enter");
  expect(await splitValue(page), "Enter").toBe("50");
  const measured = await page.evaluate(() => ({
    width: document.getElementById("main")?.getBoundingClientRect().width ?? 0,
    rootFont: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
    handle: document.querySelector('[role="separator"]')?.getBoundingClientRect().width ?? 0,
  }));
  const range = splitRange(measured.width, 20 * measured.rootFont, measured.handle);
  await expect(separator(page)).toHaveAttribute("aria-valuemin", String(range.min));
  await expect(separator(page)).toHaveAttribute("aria-valuemax", String(range.max));
  await page.keyboard.press("Home");
  expect(await splitValue(page), "Home").toBe(String(range.min));
  await page.keyboard.press("End");
  expect(await splitValue(page), "End").toBe(String(range.max));
  const lessonBox = await pane(page, "lesson").boundingBox();
  expect(
    Math.abs((lessonBox?.width ?? 0) / measured.width - range.max / 100),
    "the lesson pane follows the split",
  ).toBeLessThanOrEqual(0.01);
});

test("E-tooltip: hover and keyboard focus open it, it is hoverable, Esc closes it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(pathOf(firstLesson));
  const tip = page.getByRole("tooltip");

  const { x, y } = await gripCentre(page);
  await page.mouse.move(x, y);
  await expect(tip).toBeVisible();
  await expect(tip).toHaveText(splitHandleTooltip);
  const tipBox = await tip.boundingBox();
  if (tipBox === null) throw new Error("the tooltip is not laid out");
  await page.mouse.move(tipBox.x + tipBox.width / 2, tipBox.y + tipBox.height / 2, { steps: 10 });
  await expect(tip, "over the tip").toBeVisible();
  const focusedBefore = await page.evaluate(() => document.activeElement?.tagName);
  await page.keyboard.press("Escape");
  await expect(tip).toBeHidden();
  expect(await page.evaluate(() => document.activeElement?.tagName), "focus unchanged").toBe(
    focusedBefore,
  );

  await page.mouse.move(0, 0);
  await focusLastInLessonPane(page);
  await page.keyboard.press("Tab");
  await expect(separator(page)).toBeFocused();
  await expect(tip).toBeVisible();
  await expect(separator(page)).toHaveAccessibleDescription(splitHandleTooltip);
});

test("E-f6-handle: from the handle F6 goes on to the environment, Shift+F6 back to the lesson", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(pathOf(firstLesson));

  await separator(page).focus();
  await page.keyboard.press("F6");
  expect(await focusedRegionName(page), "F6 from the handle").toBe(environmentRegionHeading);
  await separator(page).focus();
  await page.keyboard.press("Shift+F6");
  await expect(
    page
      .getByRole("navigation", { name: breadcrumbLabel })
      .getByRole("link", { name: courseLinkLabel }),
  ).toBeFocused();
});

test("E-f6-one-pane: F6 shows the hidden pane and lands on its switch tab", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(pathOf(firstLesson));
  await page.getByRole("link", { name: brandName }).focus();

  await page.keyboard.press("F6");
  await expect(switchTab(page, lessonPaneTabLabel)).toBeFocused();
  await page.keyboard.press("F6");
  await expect(pane(page, "environment")).toBeVisible();
  await expect(switchTab(page, environmentPaneTabLabel)).toBeFocused();
  await page.keyboard.press("F6");
  await expect(page.getByRole("link", { name: brandName })).toBeFocused();
});
