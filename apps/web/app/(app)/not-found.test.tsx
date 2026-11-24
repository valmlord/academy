import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { type ReactElement, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CourseError } from "@/components/course-error";
import { FocusOnMount } from "@/components/focus-on-mount";
import { LESSON_TITLE_ID } from "@/components/lesson/lesson-header";
import { takeAnyRetryFocus } from "@/components/retry-button";
import { notFoundSentence, notFoundTitle, openCourseLabel, retryLabel } from "@/lib/copy";
import { CourseReadError } from "@/lib/course/errors";
import { getFirstReadableCourse } from "@/lib/course/server";
import { getSession } from "@/lib/session";
import NotFound from "./not-found";

// router.refresh re-renders the page from the server inside the button's transition; the mock does the
// same with a state update, so the transition ends in the commit that shows the new view.
let refreshOutcome: () => void = () => undefined;
const refresh = vi.fn(() => refreshOutcome());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/course/server", () => ({ getFirstReadableCourse: vi.fn() }));

const COURSE_ID = "ai-for-developers";
// The catalog page's h1 id (app/(app)/courses/[courseId]/page.tsx): a page file cannot export it.
const CATALOG_TITLE_ID = "course-title";

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});
afterEach(() => {
  cleanup();
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
  vi.mocked(getFirstReadableCourse).mockResolvedValue({
    kind: "course",
    tree: { id: COURSE_ID, title: "Course", description: "About", dir: COURSE_ID, modules: [] },
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
  it("renders the sentence and Открыть курс under a script-focusable h1 while the course id is known", async () => {
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

  it("renders only the h1 and the sentence while the course id is unknown", async () => {
    vi.mocked(getFirstReadableCourse).mockResolvedValue({
      kind: "course-failure",
      error: new CourseReadError(COURSE_ID, `${COURSE_ID}/course.yaml`, "unreadable (EACCES)"),
    });

    render(await NotFound());

    const main = screen.getByRole("main");
    expect(within(main).getByText(notFoundSentence)).toBeInTheDocument();
    expect(within(main).queryByRole("link")).toBeNull();
    expect(within(main).queryByRole("button")).toBeNull();
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
