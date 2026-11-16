import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { type ReactElement, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { retryLabel } from "@/lib/copy";
import { FocusOnMount } from "./focus-on-mount";
import { RetryButton, takeAnyRetryFocus } from "./retry-button";

// router.refresh re-renders the page from the server inside the button's transition; the mock does the
// same with a state update, so the transition ends in the commit that shows the new view.
let refreshOutcome: () => void = () => undefined;
const refresh = vi.fn(() => refreshOutcome());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

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
});

function Page({ willLoad }: { willLoad: boolean }): ReactElement {
  const [isLoaded, setIsLoaded] = useState(false);
  const [, setRenderCount] = useState(0);
  refreshOutcome = willLoad ? () => setIsLoaded(true) : () => setRenderCount((count) => count + 1);
  if (isLoaded) {
    return (
      <>
        <h1 id="success-target" tabIndex={-1}>
          loaded
        </h1>
        <FocusOnMount id="success-target" />
      </>
    );
  }
  return (
    <>
      <h1 id="error-target" tabIndex={-1}>
        error
      </h1>
      <RetryButton successTargetId="success-target" errorTargetId="error-target" />
    </>
  );
}

describe("RetryButton and FocusOnMount", () => {
  it("focuses the success target when the retried page loads", async () => {
    render(<Page willLoad />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: retryLabel }));
    });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "loaded" }));
  });

  it("focuses the error target when the retried page fails again", async () => {
    render(<Page willLoad={false} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: retryLabel }));
    });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "error" }));
  });

  it("focuses another element that takes the success target's place", async () => {
    function EmptyPage(): ReactElement {
      const [isLoaded, setIsLoaded] = useState(false);
      refreshOutcome = () => setIsLoaded(true);
      if (isLoaded) {
        return (
          <main id="main-target" tabIndex={-1}>
            <FocusOnMount id="main-target" retryTargetId="success-target" />
          </main>
        );
      }
      return <RetryButton successTargetId="success-target" errorTargetId="error-target" />;
    }
    render(<EmptyPage />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: retryLabel }));
    });

    expect(document.activeElement).toBe(screen.getByRole("main"));
  });

  it("leaves focus alone when a target mounts without a retry", () => {
    render(
      <>
        <h1 id="idle-target" tabIndex={-1}>
          idle
        </h1>
        <FocusOnMount id="idle-target" />
      </>,
    );

    expect(document.activeElement).toBe(document.body);
  });
});

type Phase = "error" | "removed" | "target";

let showPhase: (phase: Phase) => void = () => undefined;
let rerenderPage: () => void = () => undefined;

// The retried block, then either a view with no taker or the success target with its FocusOnMount, by the
// phase each test sets; rerenderPage re-renders the same phase.
function StagedPage(): ReactElement {
  const [phase, setPhase] = useState<Phase>("error");
  const [, setRenderCount] = useState(0);
  showPhase = setPhase;
  rerenderPage = () => setRenderCount((count) => count + 1);
  if (phase === "removed") return <p>other view</p>;
  if (phase === "target") {
    return (
      <>
        <h1 id="success-target" tabIndex={-1}>
          loaded
        </h1>
        <FocusOnMount id="success-target" />
      </>
    );
  }
  return (
    <>
      <h1 id="error-target" tabIndex={-1}>
        error
      </h1>
      <RetryButton successTargetId="success-target" errorTargetId="error-target" />
    </>
  );
}

async function pressRetry(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: retryLabel }));
  });
}

describe("the retry flag outside its own page", () => {
  it("does not focus a same-id target on another page when a navigation overtook the retry", async () => {
    window.history.replaceState(null, "", "/courses/a");
    render(<StagedPage />);
    refreshOutcome = () => {
      window.history.replaceState(null, "", "/courses/b");
      showPhase("target");
    };

    await pressRetry();

    expect(document.activeElement).toBe(document.body);
  });

  it("drops the flag when its button is removed with no taker, so a later view of the target does not move focus", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    window.history.replaceState(null, "", "/courses/c/lessons/l");
    render(<StagedPage />);
    refreshOutcome = () => showPhase("removed");
    await pressRetry();
    vi.runOnlyPendingTimers();

    await act(async () => showPhase("target"));

    expect(document.activeElement).toBe(document.body);
  });

  it("neither focuses nor keeps the flag when the pathname changed under a still-mounted button", async () => {
    window.history.replaceState(null, "", "/courses/a");
    render(<StagedPage />);
    refreshOutcome = () => {
      window.history.replaceState(null, "", "/courses/b");
      rerenderPage();
    };

    await pressRetry();

    expect(document.activeElement).toBe(document.body);

    window.history.replaceState(null, "", "/courses/a");
    await act(async () => showPhase("target"));

    expect(document.activeElement).toBe(document.body);
  });
});
