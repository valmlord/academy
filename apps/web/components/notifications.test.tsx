import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sessionExpiredMessage, signInAgainLabel } from "@/lib/copy";
import { SESSION_EXPIRED_EVENT } from "@/lib/terminal/state";
import { Notifications } from "./notifications";

vi.mock("next/navigation", () => ({
  usePathname: () => "/courses/c1/lessons/l1",
  useSearchParams: () => new URLSearchParams("tab=task"),
}));

beforeEach(() => {
  // The session read on mount finds a live session, so only the terminal's event can raise the alert.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ session: {} }), { status: 200 })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Notifications and the terminal's session-expired event (#32 design 3.6)", () => {
  it("shows the session alert with the sign-in-again link when the terminal dispatches the event", async () => {
    render(<Notifications />);
    await act(async () => undefined);
    expect(screen.queryByText(sessionExpiredMessage)).toBeNull();

    act(() => {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    });

    expect(screen.getByRole("alert")).toHaveTextContent(sessionExpiredMessage);
    expect(screen.getByRole("link", { name: signInAgainLabel })).toHaveAttribute(
      "href",
      "/sign-in?next=%2Fcourses%2Fc1%2Flessons%2Fl1%3Ftab%3Dtask",
    );
  });

  it("stops listening after unmount", async () => {
    const { unmount } = render(<Notifications />);
    await act(async () => undefined);
    unmount();

    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));

    expect(screen.queryByText(sessionExpiredMessage)).toBeNull();
  });
});
