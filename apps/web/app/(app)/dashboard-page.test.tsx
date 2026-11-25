import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { takeAnyRetryFocus } from "@/components/retry-button";
import {
  courseErrorTitle,
  modulePreparingLabel,
  nextLessonHeading,
  nextLessonLinkLabel,
  noPassedLessonsMessage,
  noReadyLessonsMessage,
  retryLabel,
  rootErrorTitle,
  startLessonLabel,
} from "@/lib/copy";
import type { SessionData } from "@/lib/session-reader";
import {
  BROKEN_COURSE_ID,
  type CourseFixture,
  createCourseFixture,
  FIXTURE_COURSE_ID,
  makeBrokenCourseReadable,
  THEORY_COURSE_TITLE,
  writeTheoryOnlyCourse,
} from "@/test/course-fixture";
import { fsCalls, useCourseRoot } from "@/test/course-server-fake";
import DashboardPage from "./page";

// The dashboard page over fixture roots, through the real every-course read: the Card of the first course with
// a next lesson, one block per listed course in list order (a failing course's block in the error form), and the
// root error alone when the root cannot be read or holds no course.

const SESSION: SessionData = {
  user: { id: "user-1", email: "learner@example.com" },
  session: { expiresAt: new Date("2030-01-01T00:00:00Z") },
};

vi.mock(
  "@/lib/course/server",
  async () => (await import("@/test/course-server-fake")).courseServerFake,
);
vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(async () => SESSION),
  getSession: vi.fn(async () => SESSION),
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

// The course blocks of every form only: each is a section labelled by its course-...-heading h2.
const BLOCK = 'section[aria-labelledby^="course-"]';
const THEORY_COURSE_ID = "a-theory-course";

let fixture: CourseFixture;

beforeEach(() => {
  fixture = createCourseFixture();
});

afterEach(() => {
  fixture.remove();
  takeAnyRetryFocus();
});

/** List order: the theory-only course, then both fixture courses, each read. */
function useThreeCourses(): void {
  makeBrokenCourseReadable(fixture);
  writeTheoryOnlyCourse(fixture, THEORY_COURSE_ID);
  useCourseRoot(fixture.root);
}

async function renderDashboard(): Promise<HTMLElement> {
  render(await DashboardPage());
  return screen.getByRole("main");
}

/** A module.yaml that does not parse, so `fixture-course` fails after its course.yaml read (title known). */
function breakFixtureModule(): void {
  fixture.write(`${FIXTURE_COURSE_ID}/00-basics/module.yaml`, "id: [unclosed\n");
}

/** A root directory that does not exist, so the root read fails. */
function missingRoot(): string {
  return path.join(fixture.root, "absent");
}

/** A course.yaml that does not parse, so `fixture-course` fails with no title read. */
function breakFixtureCourseYaml(): void {
  fixture.write(`${FIXTURE_COURSE_ID}/course.yaml`, "id: [unclosed\n");
}

/** main's links and buttons in DOM order, which is the Tab order while no element has a positive tabindex. */
function tabOrder(main: HTMLElement): (string | null)[] {
  expect(main.querySelector('[tabindex]:not([tabindex="-1"])')).toBeNull();
  return Array.from(main.querySelectorAll("a[href], button")).map((element) => element.textContent);
}

function blocks(main: HTMLElement): HTMLElement[] {
  return Array.from(main.querySelectorAll<HTMLElement>(BLOCK));
}

function blockOf(main: HTMLElement, courseId: string): HTMLElement {
  const block = main.querySelector<HTMLElement>(
    `section[aria-labelledby="course-${courseId}-heading"]`,
  );
  if (block === null) throw new Error(`no block for ${courseId}`);
  return block;
}

describe("the dashboard page", () => {
  it("shows the Card of the first course with a next lesson, its name under the heading", async () => {
    useThreeCourses();

    await renderDashboard();

    const card = within(screen.getByRole("region", { name: nextLessonHeading }));
    expect(card.getByText("Broken course")).toBeInTheDocument();
    expect(card.getByText("Broken lesson")).toBeInTheDocument();
    expect(card.getByRole("link", { name: startLessonLabel })).toHaveAttribute(
      "href",
      `/courses/${BROKEN_COURSE_ID}/lessons/broken-lesson`,
    );
  });

  it("renders one block per course in list order, each named by its h2 whose whole text links to the catalog", async () => {
    useThreeCourses();

    const main = await renderDashboard();

    const found = blocks(main).map((block) => {
      const heading = within(block).getByRole("heading", { level: 2 });
      const link = within(heading).getByRole("link");
      return {
        isLabelledByHeading: block.getAttribute("aria-labelledby") === heading.id,
        tabIndex: heading.getAttribute("tabindex"),
        name: heading.textContent,
        linkText: link.textContent,
        href: link.getAttribute("href"),
        isInlineBlock: link.classList.contains("inline-block"),
      };
    });
    expect(found).toEqual(
      [
        [THEORY_COURSE_ID, THEORY_COURSE_TITLE],
        [BROKEN_COURSE_ID, "Broken course"],
        [FIXTURE_COURSE_ID, "Fixture course"],
      ].map(([courseId, title]) => ({
        isLabelledByHeading: true,
        tabIndex: "-1",
        name: title,
        linkText: title,
        href: `/courses/${courseId}`,
        isInlineBlock: true,
      })),
    );
  });

  it("links a block's next lesson in its own course, and none in the Card course's block", async () => {
    useThreeCourses();

    const main = await renderDashboard();

    // getByRole fails on a second match, so this is the page's only next-lesson link.
    const nextLink = within(main).getByRole("link", { name: /^Следующий урок: / });
    expect(nextLink).toHaveAccessibleName(nextLessonLinkLabel("Second lesson"));
    expect(blockOf(main, FIXTURE_COURSE_ID)).toContainElement(nextLink);
    expect(nextLink).toHaveAttribute("href", `/courses/${FIXTURE_COURSE_ID}/lessons/second-lesson`);
    expect(
      within(blockOf(main, BROKEN_COURSE_ID)).queryByRole("link", { name: /^Следующий урок: / }),
    ).toBeNull();
  });

  it("shows a course with ready lessons but no counted check in the empty form", async () => {
    useThreeCourses();

    const main = await renderDashboard();

    const block = within(blockOf(main, THEORY_COURSE_ID));
    expect(block.getByText(noReadyLessonsMessage)).toBeInTheDocument();
    expect(block.queryByRole("progressbar")).toBeNull();
    expect(block.queryByRole("list")).toBeNull();
  });

  it("labels each readable block's bar by its course line", async () => {
    useThreeCourses();

    const main = await renderDashboard();

    const block = within(blockOf(main, FIXTURE_COURSE_ID));
    const bar = block.getByRole("progressbar", { name: noPassedLessonsMessage });
    expect(bar).toHaveAttribute("aria-labelledby", `course-${FIXTURE_COURSE_ID}-line`);
    expect(bar).toHaveAttribute("aria-valuetext", "0 из 1");
    expect(block.getByRole("link", { name: /Basics/ })).toHaveAttribute(
      "href",
      `/courses/${FIXTURE_COURSE_ID}#basics`,
    );
    const later = block.getByRole("link", { name: /Later/ });
    expect(later).toHaveAttribute("href", `/courses/${FIXTURE_COURSE_ID}#later`);
    expect(later).toHaveTextContent(modulePreparingLabel);
  });

  it("orders main's links as the Card button, then per block its heading link, next-lesson link and module rows", async () => {
    useThreeCourses();

    const main = await renderDashboard();

    expect(
      Array.from(main.querySelectorAll("a[href], button")).map((element) => element.textContent),
    ).toEqual([
      startLessonLabel,
      THEORY_COURSE_TITLE,
      "Broken course",
      expect.stringContaining("Only module"),
      "Fixture course",
      nextLessonLinkLabel("Second lesson"),
      expect.stringContaining("Basics"),
      expect.stringContaining("Later"),
    ]);
    expect(main.querySelector('[tabindex]:not([tabindex="-1"])')).toBeNull();
  });

  it("shows no Card when no course has a next lesson", async () => {
    writeTheoryOnlyCourse(fixture, THEORY_COURSE_ID);
    rmSync(fixture.path(BROKEN_COURSE_ID), { recursive: true });
    rmSync(fixture.path(FIXTURE_COURSE_ID), { recursive: true });
    useCourseRoot(fixture.root);

    const main = await renderDashboard();

    expect(screen.queryByRole("region", { name: nextLessonHeading })).toBeNull();
    const found = blocks(main);
    expect(found).toHaveLength(1);
    expect(found[0]).toHaveTextContent(noReadyLessonsMessage);
    expect(found[0]?.querySelector('[role="progressbar"]')).toBeNull();
  });

  it("renders a failing course's block in the error form beside the Card of a readable one", async () => {
    makeBrokenCourseReadable(fixture);
    breakFixtureModule();
    useCourseRoot(fixture.root);

    const main = await renderDashboard();

    const card = within(screen.getByRole("region", { name: nextLessonHeading }));
    expect(card.getByText("Broken course")).toBeInTheDocument();
    const block = blockOf(main, FIXTURE_COURSE_ID);
    const heading = within(block).getByRole("heading", { level: 2 });
    expect(block).toHaveAttribute("aria-labelledby", heading.id);
    expect(heading).toHaveAttribute("tabindex", "-1");
    expect(heading).toHaveTextContent(/^Fixture course$/);
    expect(within(heading).queryByRole("link")).toBeNull();
    const title = within(block).getByRole("heading", { level: 3, name: courseErrorTitle });
    expect(title).toHaveAttribute("id", `course-${FIXTURE_COURSE_ID}-error-title`);
    expect(title).toHaveAttribute("tabindex", "-1");
    const [button, ...otherButtons] = within(block).getAllByRole("button");
    expect(otherButtons).toEqual([]);
    expect(button).toHaveAccessibleName(retryLabel);
    expect(button).toHaveAccessibleDescription("Fixture course");
    expect(main.querySelector('[role="alert"]')).toBeNull();
    expect(main.querySelector("[aria-live]")).toBeNull();
  });

  it("names a course whose title cannot be read by its id", async () => {
    useCourseRoot(fixture.root);

    const main = await renderDashboard();

    const region = within(main).getByRole("region", { name: BROKEN_COURSE_ID });
    expect(within(region).getByRole("heading", { level: 2 })).toHaveTextContent(
      new RegExp(`^${BROKEN_COURSE_ID}$`),
    );
    expect(within(region).getByRole("button", { name: retryLabel })).toHaveAccessibleDescription(
      BROKEN_COURSE_ID,
    );
  });

  it("renders one error-form block per course and no Card when every course fails", async () => {
    breakFixtureCourseYaml();
    useCourseRoot(fixture.root);

    const main = await renderDashboard();

    const found = blocks(main);
    expect(found).toHaveLength(2);
    for (const block of found) {
      expect(
        within(block).getByRole("heading", { level: 3, name: courseErrorTitle }),
      ).toBeVisible();
      expect(within(block).getByRole("button", { name: retryLabel })).toBeVisible();
    }
    expect(screen.queryByRole("heading", { name: nextLessonHeading })).toBeNull();
    expect(screen.queryByRole("region", { name: nextLessonHeading })).toBeNull();
  });

  it.each<[string, () => string | undefined, unknown[]]>([
    [
      "one-course-error",
      () => {
        rmSync(fixture.path(BROKEN_COURSE_ID), { recursive: true });
        breakFixtureModule();
        return undefined;
      },
      [retryLabel],
    ],
    ["root-error", missingRoot, [retryLabel]],
    [
      "courses-no-card",
      () => {
        rmSync(fixture.path(FIXTURE_COURSE_ID), { recursive: true });
        writeTheoryOnlyCourse(fixture, "z-theory-course");
        return undefined;
      },
      [retryLabel, THEORY_COURSE_TITLE],
    ],
    [
      "courses-one-broken",
      () => {
        makeBrokenCourseReadable(fixture);
        breakFixtureModule();
        return undefined;
      },
      [startLessonLabel, "Broken course", expect.stringContaining("Only module"), retryLabel],
    ],
    [
      "courses-broken-no-title",
      () => {
        makeBrokenCourseReadable(fixture);
        breakFixtureCourseYaml();
        return undefined;
      },
      [startLessonLabel, "Broken course", expect.stringContaining("Only module"), retryLabel],
    ],
    [
      "courses-other-broke",
      () => undefined,
      [
        startLessonLabel,
        retryLabel,
        "Fixture course",
        expect.stringContaining("Basics"),
        expect.stringContaining("Later"),
      ],
    ],
  ])("orders main's links and buttons for %s", async (_state, arrange, expected) => {
    // An arrangement returns the root it needs when that is not the fixture root.
    useCourseRoot(arrange() ?? fixture.root);

    const main = await renderDashboard();

    expect(tabOrder(main)).toEqual(expected);
  });

  it("names blocks of directories outside the id form by their name, with ids unique in main", async () => {
    // fixture_course, not Fixture-Course: on a case-insensitive file system the latter is fixture-course itself.
    // A token that lowercased the name and turned other characters into "-" would give it fixture-course's ids.
    mkdirSync(fixture.path("My Course"));
    mkdirSync(fixture.path("fixture_course"));
    useCourseRoot(fixture.root);

    const main = await renderDashboard();

    for (const name of ["My Course", "fixture_course"]) {
      const region = within(main).getByRole("region", { name });
      expect(within(region).getByRole("button", { name: retryLabel })).toHaveAccessibleDescription(
        name,
      );
    }
    const ids = Array.from(main.querySelectorAll("[id]")).map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // The mocked router.refresh renders nothing new, so the page after the press shows the same error.
  it.each<[string, () => string, string]>([
    [
      "the block error form",
      () => {
        rmSync(fixture.path(BROKEN_COURSE_ID), { recursive: true });
        breakFixtureModule();
        return fixture.root;
      },
      `course-${FIXTURE_COURSE_ID}-error-title`,
    ],
    ["the root error", missingRoot, "root-error-title"],
  ])(
    "focuses %s's own heading when its retry renders the same error again",
    async (_form, root, titleId) => {
      useCourseRoot(root());
      const main = await renderDashboard();

      await act(async () => {
        fireEvent.click(within(main).getByRole("button", { name: retryLabel }));
      });

      const title = main.querySelector(`#${titleId}`);
      expect(title).not.toBeNull();
      expect(document.activeElement).toBe(title);
    },
  );

  it.each([
    ["a missing root", missingRoot],
    [
      "an empty root",
      (): string => {
        rmSync(fixture.path(BROKEN_COURSE_ID), { recursive: true });
        rmSync(fixture.path(FIXTURE_COURSE_ID), { recursive: true });
        return fixture.root;
      },
    ],
  ])("shows the static root error alone in the Card's place for %s", async (_label, root) => {
    useCourseRoot(root());

    const main = await renderDashboard();

    const title = within(main).getByRole("heading", { level: 2, name: rootErrorTitle });
    expect(title).toHaveAttribute("id", "root-error-title");
    expect(title).toHaveAttribute("tabindex", "-1");
    const [button, ...otherButtons] = within(main).getAllByRole("button");
    expect(otherButtons).toEqual([]);
    expect(button).toHaveAccessibleName(retryLabel);
    expect(screen.queryByRole("heading", { name: nextLessonHeading })).toBeNull();
    expect(blocks(main)).toHaveLength(0);
    expect(main.querySelector('[role="alert"]')).toBeNull();
  });

  it("lists the root once and opens each course's course.yaml once (ADR-0009 item 8)", async () => {
    useThreeCourses();

    await renderDashboard();

    expect(fsCalls.filter((call) => call === 'listDirs ""')).toEqual(['listDirs ""']);
    for (const courseId of [THEORY_COURSE_ID, BROKEN_COURSE_ID, FIXTURE_COURSE_ID]) {
      const courseFile = `readText "${courseId}/course.yaml"`;
      expect(fsCalls.filter((call) => call === courseFile)).toEqual([courseFile]);
    }
  });
});
