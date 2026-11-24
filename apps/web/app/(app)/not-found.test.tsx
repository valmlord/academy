import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { headers } from "next/headers";
import { type ReactElement, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CourseError } from "@/components/course-error";
import { FocusOnMount } from "@/components/focus-on-mount";
import { LESSON_TITLE_ID } from "@/components/lesson/lesson-header";
import { takeAnyRetryFocus } from "@/components/retry-button";
import { notFoundSentence, notFoundTitle, openCourseLabel, retryLabel } from "@/lib/copy";
import { PATHNAME_HEADER } from "@/lib/next-path";
import { getSession } from "@/lib/session";
import {
  BROKEN_COURSE_ID,
  type CourseFixture,
  createCourseFixture,
  FIXTURE_COURSE_ID,
} from "@/test/course-fixture";
import { fsCalls, useCourseRoot } from "@/test/course-server-fake";
import NotFound from "./not-found";

// router.refresh re-renders the page from the server inside the button's transition; the mock does the
// same with a state update, so the transition ends in the commit that shows the new view.
let refreshOutcome: () => void = () => undefined;
const refresh = vi.fn(() => refreshOutcome());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock(
  "@/lib/course/server",
  async () => (await import("@/test/course-server-fake")).courseServerFake,
);
vi.mock("next/headers", () => ({ headers: vi.fn() }));

const COURSE_ID = FIXTURE_COURSE_ID;
// The catalog page's h1 id (app/(app)/courses/[courseId]/page.tsx): a page file cannot export it.
const CATALOG_TITLE_ID = "course-title";

let fixture: CourseFixture;

/** The request as the proxy forwards it: with the pathname header, or without one where it did not run. */
function requestPath(pathname: string | undefined): void {
  vi.mocked(headers).mockResolvedValue(
    new Headers(pathname === undefined ? {} : { [PATHNAME_HEADER]: pathname }),
  );
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  fixture = createCourseFixture();
  useCourseRoot(fixture.root);
  requestPath(undefined);
});
afterEach(() => {
  cleanup();
  fixture.remove();
  if (vi.isFakeTimers()) {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  }
  takeAnyRetryFocus();
});

beforeEach(() => {
  refresh.mockClear();
  vi.mocked(getSession).mockResolvedValue({
    user: { id: "user-1", email: "learner@example.com" },
    session: { expiresAt: new Date("2030-01-01T00:00:00Z") },
  });
});

type Phase = "error" | "notFound" | "catalog";

let showPhase: (phase: Phase) => void = () => undefined;
let openCatalog: () => void = () => undefined;

// A page whose course error the retry replaces: by the not-found view the refresh ends on, then, through
// openCatalog, by the catalog's h1 with its own FocusOnMount.
function RetriedPage({
  successTargetId,
  notFoundView,
}: {
  successTargetId: string;
  notFoundView: ReactElement;
}): ReactElement {
  const [phase, setPhase] = useState<Phase>("error");
  showPhase = setPhase;
  openCatalog = () => setPhase("catalog");
  if (phase === "notFound") return notFoundView;
  if (phase === "catalog") {
    return (
      <>
        <h1 id={CATALOG_TITLE_ID} tabIndex={-1}>
          course
        </h1>
        <FocusOnMount id={CATALOG_TITLE_ID} />
      </>
    );
  }
  return <CourseError isPageHeading successTargetId={successTargetId} />;
}

async function pressRetry(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: retryLabel }));
  });
}

describe("NotFound", () => {
  it("renders the sentence and Открыть курс under a script-focusable h1 for an unknown lesson of a readable course", async () => {
    requestPath(`/courses/${COURSE_ID}/lessons/no-such-lesson`);

    render(await NotFound());

    const heading = screen.getByRole("heading", { level: 1, name: notFoundTitle });
    expect(heading).toHaveAttribute("id", "not-found-title");
    expect(heading).toHaveAttribute("tabindex", "-1");
    const paragraphs = screen.getByRole("main").querySelectorAll("p");
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]).toHaveTextContent(notFoundSentence);
    expect(screen.getByRole("link", { name: openCourseLabel })).toHaveAttribute(
      "href",
      `/courses/${COURSE_ID}`,
    );
  });

  // The page cannot tell the proxy's header from a client's, so each row is also a spoofed header on a path
  // the proxy skips.
  it.each<[string, string | undefined, string[]]>([
    ["a course id outside the id form", "/courses/A%20B/lessons/x", []],
    ["an encoded traversal", "/courses/..%2Fcourse-b/lessons/x", []],
    ["an unlisted course", "/courses/no-such-course/lessons/x", ['listDirs ""']],
    [
      "a failing course",
      `/courses/${BROKEN_COURSE_ID}/lessons/x`,
      ['listDirs ""', 'readText "broken-course/course.yaml"'],
    ],
    ["a catalog path", `/courses/${COURSE_ID}`, []],
    ["an unmatched path", "/no/such/path", []],
    ["no pathname header", undefined, []],
  ])(
    "renders only the h1 and the sentence for %s, opening only %o",
    async (_case, pathname, files) => {
      requestPath(pathname);

      render(await NotFound());

      const main = screen.getByRole("main");
      expect(within(main).getByText(notFoundSentence)).toBeInTheDocument();
      expect(within(main).queryByRole("link")).toBeNull();
      expect(within(main).queryByRole("button")).toBeNull();
      expect(fsCalls).toEqual(files);
    },
  );

  it("reads no course without a session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    requestPath(`/courses/${COURSE_ID}/lessons/no-such-lesson`);

    render(await NotFound());

    expect(within(screen.getByRole("main")).queryByRole("link")).toBeNull();
    expect(fsCalls).toEqual([]);
  });

  it.each([
    ["catalog", "/courses/no-such-course", CATALOG_TITLE_ID],
    ["lesson", `/courses/${COURSE_ID}/lessons/no-such-lesson`, LESSON_TITLE_ID],
  ])(
    "focuses the not-found h1 after a %s retry that ends on this page",
    async (_kind, path, targetId) => {
      window.history.replaceState(null, "", path);
      const notFoundView = await NotFound();
      render(<RetriedPage successTargetId={targetId} notFoundView={notFoundView} />);
      refreshOutcome = () => showPhase("notFound");

      await pressRetry();

      expect(refresh).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { level: 1, name: notFoundTitle }),
      );
    },
  );

  it("takes the retry flag, so a view mounted next on the same pathname does not move focus", async () => {
    // Holds the button's deferred drop, so only the not-found taker's own drop is under test.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    window.history.replaceState(null, "", "/courses/no-such-course");
    const notFoundView = await NotFound();
    render(<RetriedPage successTargetId={CATALOG_TITLE_ID} notFoundView={notFoundView} />);
    refreshOutcome = () => showPhase("notFound");
    await pressRetry();

    // Kept on the same pathname on purpose: it isolates the taker's drop from the pathname rule.
    await act(async () => openCatalog());

    expect(document.activeElement).toBe(document.body);
  });

  it("leaves focus where it was on an ordinary arrival", async () => {
    render(await NotFound());

    expect(document.activeElement).toBe(document.body);
  });

  it("leaves focus where it was when a navigation to an unknown URL overtook a retry pressed on another page", async () => {
    window.history.replaceState(null, "", `/courses/${COURSE_ID}`);
    const notFoundView = await NotFound();
    render(<RetriedPage successTargetId={CATALOG_TITLE_ID} notFoundView={notFoundView} />);
    refreshOutcome = () => {
      window.history.replaceState(null, "", "/no/such/path");
      showPhase("notFound");
    };

    await pressRetry();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(document.body);
  });
});
