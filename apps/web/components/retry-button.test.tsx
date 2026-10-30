import { act, fireEvent, render, screen } from "@testing-library/react";
import { type ReactElement, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { retryLabel } from "@/lib/copy";
import { FocusOnMount } from "./focus-on-mount";
import { RetryButton } from "./retry-button";

// router.refresh re-renders the page from the server inside the button's transition; the mock does the
// same with a state update, so the transition ends in the commit that shows the new view.
let refreshOutcome: () => void = () => undefined;
const refresh = vi.fn(() => refreshOutcome());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

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
