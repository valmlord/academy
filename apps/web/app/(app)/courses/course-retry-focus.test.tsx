import { readFileSync, rmSync } from "node:fs";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { headers } from "next/headers";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { takeAnyRetryFocus } from "@/components/retry-button";
import { courseErrorTitle, notFoundTitle, retryLabel } from "@/lib/copy";
import { PATHNAME_HEADER } from "@/lib/next-path";
import type { SessionData } from "@/lib/session-reader";
import {
  BROKEN_COURSE_ID,
  type CourseFixture,
  createCourseFixture,
  FIXTURE_COURSE_ID,
  makeBrokenCourseReadable,
} from "@/test/course-fixture";
import { useCourseRoot } from "@/test/course-server-fake";
import {
  queueRetryAnswer,
  RetriedPage,
  refreshRetriedPage,
  releaseRetryAnswer,
} from "@/test/retried-page";
import AppLayout from "../layout";
import NotFound from "../not-found";
import LessonPage from "./[courseId]/lessons/[lessonId]/page";
import CatalogPage from "./[courseId]/page";

// The retry focus guard on the real catalog and lesson pages under the real (app) layout (catalog AC18, lesson
// AC19): the refresh answer is held, so a test can move focus after the press and before the answer commits.
// The top bar is outside `main`, the retry's block on both pages.

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
  useRouter: () => ({ refresh: refreshRetriedPage, push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
// An async server component, which a client render cannot run; the lesson text has its own tests.
vi.mock("@/components/lesson/lesson-text", () => ({ LessonText: () => null }));
// Its server actions reach the auth and workspace clients; the fixture's lesson under test has no workspace.
vi.mock("@/components/environment/environment-region", () => ({ EnvironmentRegion: () => null }));
vi.mock("../actions", () => ({ signOutAction: vi.fn() }));

const FIRST_LESSON_ID = "first-lesson";
const FIXTURE_COURSE_YAML = `${FIXTURE_COURSE_ID}/course.yaml`;

let fixture: CourseFixture;

beforeEach(() => {
  fixture = createCourseFixture();
  useCourseRoot(fixture.root);
  vi.mocked(headers).mockResolvedValue(new Headers());
});

afterEach(() => {
  fixture.remove();
  takeAnyRetryFocus();
});

function catalogPath(courseId: string): string {
  return `/courses/${courseId}`;
}

function catalogPage(courseId: string): Promise<ReactElement> {
  return CatalogPage({ params: Promise.resolve({ courseId }), searchParams: Promise.resolve({}) });
}

function lessonPage(courseId: string): Promise<ReactElement> {
  return LessonPage({
    params: Promise.resolve({ courseId, lessonId: FIRST_LESSON_ID }),
    searchParams: Promise.resolve({}),
  });
}

/** Renders the page under the (app) layout at `pathname` and checks it shows the course error. */
async function renderRetried(pathname: string, page: ReactElement): Promise<void> {
  window.history.replaceState(null, "", pathname);
  render(
    await AppLayout({ children: <RetriedPage initial={page} />, params: Promise.resolve({}) }),
  );
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(courseErrorTitle);
}

/** Presses the retry, whose answer `queueRetryAnswer` has set, and checks the press focused the button. */
async function pressRetry(): Promise<void> {
  const button = within(screen.getByRole("main")).getByRole("button", { name: retryLabel });
  await act(async () => {
    fireEvent.click(button);
  });
  expect(document.activeElement).toBe(button);
}

function userMenuButton(): HTMLElement {
  return within(screen.getByRole("banner")).getByRole("button");
}

function fixtureCourseLink(): HTMLElement {
  return within(screen.getByRole("main")).getByRole("link", { name: "Fixture course" });
}

describe("the catalog retry focus guard", () => {
  beforeEach(async () => {
    await renderRetried(catalogPath(BROKEN_COURSE_ID), await catalogPage(BROKEN_COURSE_ID));
  });

  it("moves focus to the course h1 when the course loads and the focused Другие курсы link is gone", async () => {
    makeBrokenCourseReadable(fixture);
    rmSync(fixture.path(FIXTURE_COURSE_ID), { recursive: true });
    queueRetryAnswer(await catalogPage(BROKEN_COURSE_ID));
    await pressRetry();

    fixtureCourseLink().focus();
    await releaseRetryAnswer();

    expect(document.activeElement).toBe(
      screen.getByRole("heading", { level: 1, name: "Broken course" }),
    );
  });

  it("moves focus to the error h1 when the course fails again and the focused Другие курсы link is gone", async () => {
    rmSync(fixture.path(FIXTURE_COURSE_ID), { recursive: true });
    queueRetryAnswer(await catalogPage(BROKEN_COURSE_ID));
    await pressRetry();

    fixtureCourseLink().focus();
    await releaseRetryAnswer();

    expect(document.activeElement).toBe(
      screen.getByRole("heading", { level: 1, name: courseErrorTitle }),
    );
  });

  it("keeps focus in the top bar when the course loads", async () => {
    makeBrokenCourseReadable(fixture);
    queueRetryAnswer(await catalogPage(BROKEN_COURSE_ID));
    await pressRetry();

    userMenuButton().focus();
    await releaseRetryAnswer();

    expect(screen.getByRole("heading", { level: 1, name: "Broken course" })).toBeInTheDocument();
    expect(document.activeElement).toBe(userMenuButton());
  });

  it("keeps focus in the top bar when the course fails again", async () => {
    queueRetryAnswer(await catalogPage(BROKEN_COURSE_ID));
    await pressRetry();

    userMenuButton().focus();
    await releaseRetryAnswer();

    expect(document.activeElement).toBe(userMenuButton());
  });

  it("moves focus to the course h1 when focus moved to main itself before the course loads", async () => {
    makeBrokenCourseReadable(fixture);
    queueRetryAnswer(await catalogPage(BROKEN_COURSE_ID));
    await pressRetry();

    screen.getByRole("main").focus();
    await releaseRetryAnswer();

    expect(document.activeElement).toBe(
      screen.getByRole("heading", { level: 1, name: "Broken course" }),
    );
  });

  it("focuses the not-found h1 after a catalog retry that ends on not-found, although focus moved to the top bar", async () => {
    rmSync(fixture.path(BROKEN_COURSE_ID), { recursive: true });
    vi.mocked(headers).mockResolvedValue(
      new Headers({ [PATHNAME_HEADER]: catalogPath(BROKEN_COURSE_ID) }),
    );
    queueRetryAnswer(await NotFound());
    await pressRetry();

    userMenuButton().focus();
    await releaseRetryAnswer();

    expect(document.activeElement).toBe(
      screen.getByRole("heading", { level: 1, name: notFoundTitle }),
    );
  });
});

describe("the lesson retry focus guard", () => {
  let courseYaml: string;

  beforeEach(async () => {
    courseYaml = readFileSync(fixture.path(FIXTURE_COURSE_YAML), "utf8");
    fixture.write(FIXTURE_COURSE_YAML, "id: [");
    await renderRetried(
      `${catalogPath(FIXTURE_COURSE_ID)}/lessons/${FIRST_LESSON_ID}`,
      await lessonPage(FIXTURE_COURSE_ID),
    );
  });

  it("moves focus to the lesson h1 when the lesson's course loads and focus stayed on Повторить", async () => {
    fixture.write(FIXTURE_COURSE_YAML, courseYaml);
    queueRetryAnswer(await lessonPage(FIXTURE_COURSE_ID));
    await pressRetry();

    await releaseRetryAnswer();

    expect(document.activeElement).toBe(
      screen.getByRole("heading", { level: 1, name: "First lesson" }),
    );
  });

  it("keeps focus in the top bar when the lesson's course loads", async () => {
    fixture.write(FIXTURE_COURSE_YAML, courseYaml);
    queueRetryAnswer(await lessonPage(FIXTURE_COURSE_ID));
    await pressRetry();

    userMenuButton().focus();
    await releaseRetryAnswer();

    expect(screen.getByRole("heading", { level: 1, name: "First lesson" })).toBeInTheDocument();
    expect(document.activeElement).toBe(userMenuButton());
  });

  it("keeps focus in the top bar when the lesson's course fails again", async () => {
    queueRetryAnswer(await lessonPage(FIXTURE_COURSE_ID));
    await pressRetry();

    userMenuButton().focus();
    await releaseRetryAnswer();

    expect(document.activeElement).toBe(userMenuButton());
  });
});
