import { rmSync } from "node:fs";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  courseErrorTitle,
  modulePreparingLabel,
  nextLessonHeading,
  nextLessonLinkLabel,
  noPassedLessonsMessage,
  noReadyLessonsMessage,
  retryLabel,
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
// a next lesson, one block per readable course in list order, and the one course error when no course reads.

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

// The course blocks only: the Card's section is labelled by the Card heading, the course error is a div.
const BLOCK = 'section[aria-labelledby^="course-"]';
const THEORY_COURSE_ID = "a-theory-course";

let fixture: CourseFixture;

beforeEach(() => {
  fixture = createCourseFixture();
});

afterEach(() => {
  fixture.remove();
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

  it("renders the readable course beside a failing one without a course error", async () => {
    useCourseRoot(fixture.root);

    const main = await renderDashboard();

    const card = within(screen.getByRole("region", { name: nextLessonHeading }));
    expect(card.getByText("Fixture course")).toBeInTheDocument();
    expect(blocks(main)).toHaveLength(1);
    expect(screen.queryByText(courseErrorTitle)).toBeNull();
  });

  it.each([
    ["a missing root", (): string => path.join(fixture.root, "absent")],
    [
      "an empty root",
      (): string => {
        rmSync(fixture.path(BROKEN_COURSE_ID), { recursive: true });
        rmSync(fixture.path(FIXTURE_COURSE_ID), { recursive: true });
        return fixture.root;
      },
    ],
    [
      "a root whose every course fails",
      (): string => {
        fixture.write(`${FIXTURE_COURSE_ID}/course.yaml`, "id: [unclosed\n");
        return fixture.root;
      },
    ],
  ])("shows the one course error in the Card's place for %s", async (_label, root) => {
    useCourseRoot(root());

    const main = await renderDashboard();

    expect(screen.getByText(courseErrorTitle)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: retryLabel })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: nextLessonHeading })).toBeNull();
    expect(blocks(main)).toHaveLength(0);
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
