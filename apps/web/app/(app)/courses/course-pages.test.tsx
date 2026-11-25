import { render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { brandName, breadcrumbLabel, courseErrorTitle, homeTitle, notFoundTitle } from "@/lib/copy";
import type { SessionData } from "@/lib/session-reader";
import {
  BROKEN_COURSE_ID,
  type CourseFixture,
  createCourseFixture,
  FIXTURE_COURSE_ID,
} from "@/test/course-fixture";
import { fsCalls, useCourseRoot } from "@/test/course-server-fake";
import AppLayout from "../layout";
import LessonPage, {
  generateMetadata as lessonMetadata,
} from "./[courseId]/lessons/[lessonId]/page";
import CatalogPage, { generateMetadata as catalogMetadata } from "./[courseId]/page";

// The catalog and lesson pages and their metadata over a two-course fixture root, through the real per-course
// read (ADR-0009 item 8): an id that names no course is not found and opens no course file, a failing course
// shows the course error, the readable course beside it renders. Then the layout's top bar, which reads no course.

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
// An async server component, which a client render cannot run; the lesson text has its own tests.
vi.mock("@/components/lesson/lesson-text", () => ({ LessonText: () => null }));
// Its server actions reach the auth and workspace clients; the fixture's lesson under test has no workspace.
vi.mock("@/components/environment/environment-region", () => ({ EnvironmentRegion: () => null }));
vi.mock("../actions", () => ({ signOutAction: vi.fn() }));

const FIRST_LESSON_ID = "first-lesson";
// The four request ids of the per-course read's form and lookup steps, with the file calls each may make.
const UNKNOWN_IDS: [string, string[]][] = [
  ["A B", []],
  ["..", []],
  ["../course-b", []],
  ["no-such-course", ['listDirs ""']],
];

let fixture: CourseFixture;

beforeEach(() => {
  fixture = createCourseFixture();
  useCourseRoot(fixture.root);
});

afterEach(() => {
  fixture.remove();
});

function catalogProps(courseId: string): PageProps<"/courses/[courseId]"> {
  return { params: Promise.resolve({ courseId }), searchParams: Promise.resolve({}) };
}

function lessonProps(courseId: string): PageProps<"/courses/[courseId]/lessons/[lessonId]"> {
  return {
    params: Promise.resolve({ courseId, lessonId: FIRST_LESSON_ID }),
    searchParams: Promise.resolve({}),
  };
}

// What notFound() throws: Next renders the not-found boundary with status 404 for it.
function isNotFoundSignal(error: unknown): boolean {
  return (
    error instanceof Error && "digest" in error && error.digest === "NEXT_HTTP_ERROR_FALLBACK;404"
  );
}

async function thrownBy(act: () => Promise<unknown>): Promise<unknown> {
  try {
    await act();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe.each([
  {
    page: "catalog",
    render: (courseId: string): Promise<ReactElement> => CatalogPage(catalogProps(courseId)),
    title: (courseId: string) => catalogMetadata(catalogProps(courseId)),
    heading: "Fixture course",
  },
  {
    page: "lesson",
    render: (courseId: string): Promise<ReactElement> => LessonPage(lessonProps(courseId)),
    title: (courseId: string) => lessonMetadata(lessonProps(courseId)),
    heading: "First lesson",
  },
])("the $page page", ({ render: renderPage, title, heading }) => {
  it.each(UNKNOWN_IDS)("is not found for %s and opens only %o", async (courseId, files) => {
    const error = await thrownBy(() => renderPage(courseId));

    expect(isNotFoundSignal(error)).toBe(true);
    expect(fsCalls).toEqual(files);
  });

  it.each(UNKNOWN_IDS)("titles %s as not found, opening only %o", async (courseId, files) => {
    const metadata = await title(courseId);

    expect(metadata.title).toBe(notFoundTitle);
    expect(fsCalls).toEqual(files);
  });

  it("shows the course error for the failing course", async () => {
    render(await renderPage(BROKEN_COURSE_ID));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(courseErrorTitle);
    expect((await title(BROKEN_COURSE_ID)).title).toBe(courseErrorTitle);
  });

  it("renders the readable course beside the failing one", async () => {
    render(await renderPage(FIXTURE_COURSE_ID));

    expect(screen.getByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
    expect((await title(FIXTURE_COURSE_ID)).title).toBe(heading);
  });
});

describe("the lesson page's breadcrumb", () => {
  it("names the course crumb by the course title and links both crumbs into the URL's course", async () => {
    render(await LessonPage(lessonProps(FIXTURE_COURSE_ID)));

    const crumbs = within(screen.getByRole("navigation", { name: breadcrumbLabel }));
    expect(crumbs.getByRole("link", { name: "Fixture course" })).toHaveAttribute(
      "href",
      `/courses/${FIXTURE_COURSE_ID}`,
    );
    expect(crumbs.getByRole("link", { name: "Basics" })).toHaveAttribute(
      "href",
      `/courses/${FIXTURE_COURSE_ID}#basics`,
    );
  });
});

describe("the (app) layout", () => {
  async function banner(): Promise<HTMLElement> {
    render(await AppLayout({ children: null, params: Promise.resolve({}) }));
    return screen.getByRole("banner");
  }

  it("links the brand and the home page only, and opens no course file", async () => {
    const top = await banner();

    expect(
      within(top)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual([brandName, homeTitle]);
    expect(fsCalls).toEqual([]);
  });
});
