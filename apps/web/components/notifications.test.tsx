import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  continueWorkLabel,
  idleWarningMessage,
  notificationsHeading,
  sessionExpiredMessage,
  signInAgainLabel,
} from "@/lib/copy";
import {
  IDLE_CLEARED_EVENT,
  IDLE_CONTINUE_EVENT,
  IDLE_WARNING_EVENT,
} from "@/lib/environment/idle";
import { SESSION_EXPIRED_EVENT } from "@/lib/terminal/state";
import { Notifications } from "./notifications";
import { SHOW_PANE_EVENT } from "./region-cycle";

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
  // test/setup.ts only unmounts and vitest has no restoreMocks, so N15's prototype spies are restored here.
  vi.restoreAllMocks();
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

// #106 design 5, R7-1 and R8-1: the idle warning and where focus goes when it goes. The page around Notifications is
// built by hand: two outside buttons, then the lesson section and the environment section with two buttons each,
// as the lesson layout orders them. "Hidden" is an inline `visibility: hidden`, which `isRendered` reads in jsdom.

interface PageProps {
  removed?: "lesson-2" | "environment-2";
  hidden?: "lesson" | "environment";
  hasStatusAction?: boolean;
  hasEnvironmentTab?: boolean;
}

const HIDDEN = { visibility: "hidden" } as const;

function Page({ removed, hidden, hasStatusAction, hasEnvironmentTab }: PageProps): ReactElement {
  return (
    <>
      <Notifications />
      <button type="button">outside</button>
      <button type="button">second outside</button>
      <section data-region data-pane="lesson" style={hidden === "lesson" ? HIDDEN : undefined}>
        <p>the lesson text</p>
        <button type="button">lesson 1</button>
        {removed === "lesson-2" ? null : <button type="button">lesson 2</button>}
        {hasEnvironmentTab === true ? (
          <button type="button" role="tab" aria-controls="environment-pane" tabIndex={-1}>
            environment tab
          </button>
        ) : null}
      </section>
      <section
        data-region
        data-pane="environment"
        style={hidden === "environment" ? HIDDEN : undefined}
      >
        <button type="button">environment 1</button>
        {removed === "environment-2" ? null : (
          <button type="button" data-status-action={hasStatusAction === true ? "" : undefined}>
            environment 2
          </button>
        )}
      </section>
    </>
  );
}

function button(name: string): HTMLElement {
  return screen.getByRole("button", { name, hidden: true });
}

function continueButton(): HTMLElement {
  return screen.getByRole("button", { name: continueWorkLabel });
}

function showWarning(detail: unknown = { minutes: 5 }): void {
  act(() => {
    window.dispatchEvent(new CustomEvent(IDLE_WARNING_EVENT, { detail }));
  });
}

function clearWarning(detail: unknown = {}): void {
  act(() => {
    window.dispatchEvent(new CustomEvent(IDLE_CLEARED_EVENT, { detail }));
  });
}

function expireSession(): void {
  act(() => {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  });
}

function focus(element: HTMLElement): void {
  act(() => element.focus());
}

/** Clicks the button and returns how many continue events it dispatched. */
function clickCounting(element: HTMLElement): number {
  let count = 0;
  const listener = (): void => {
    count += 1;
  };
  window.addEventListener(IDLE_CONTINUE_EVENT, listener);
  act(() => {
    fireEvent.click(element);
  });
  window.removeEventListener(IDLE_CONTINUE_EVENT, listener);
  return count;
}

function warningText(): HTMLElement | null {
  return screen.queryByText(idleWarningMessage(5));
}

async function renderPage(props: PageProps = {}): Promise<(next: PageProps) => void> {
  const { rerender } = render(<Page {...props} />);
  await act(async () => undefined);
  return (next) => rerender(<Page {...next} />);
}

async function renderUnderOpenMenu(): Promise<void> {
  render(
    <>
      <Notifications />
      <p>sibling</p>
      <DropdownMenu>
        <DropdownMenuTrigger>menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>item</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>,
  );
  await act(async () => undefined);
  const trigger = screen.getByRole("button", { name: "menu" });
  trigger.focus();

  fireEvent.keyDown(trigger, { key: "Enter" });
  await screen.findByRole("menu");
}

describe("Notifications idle warning (#106 design 5)", () => {
  it("shows the warning inside the existing status container, with no live role of its own (N1)", async () => {
    await renderPage();
    const status = screen.getByRole("status");

    showWarning();

    expect(screen.getByRole("status")).toBe(status);
    expect(status).toHaveTextContent(idleWarningMessage(5));
    expect(within(status).getByRole("button", { name: continueWorkLabel })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: notificationsHeading })).toBeInTheDocument();
    const alerts = screen.queryAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toBeEmptyDOMElement();
  });

  it.each([[{ minutes: "5" }], [{}], [null], [{ minutes: 0 }]])(
    "shows nothing for the detail %j (N2)",
    async (detail) => {
      await renderPage();

      showWarning(detail);

      expect(screen.queryByRole("button", { name: continueWorkLabel })).toBeNull();
    },
  );

  it("continues and returns focus to the element focus came from (N3)", async () => {
    await renderPage();
    showWarning();
    focus(button("outside"));
    focus(continueButton());

    expect(clickCounting(continueButton())).toBe(1);

    expect(warningText()).toBeNull();
    expect(button("outside")).toHaveFocus();
  });

  it("sends a removed return target to its place, the lesson pane (N4)", async () => {
    const rerender = await renderPage();
    showWarning();
    focus(button("lesson 2"));
    focus(continueButton());
    rerender({ removed: "lesson-2" });

    clickCounting(continueButton());

    expect(button("lesson 1")).toHaveFocus();
  });

  it("sends a removed return target to its place, the environment pane (N4b)", async () => {
    const rerender = await renderPage();
    showWarning();
    focus(button("environment 2"));
    focus(continueButton());
    rerender({ removed: "environment-2" });

    clickCounting(continueButton());

    expect(button("environment 1")).toHaveFocus();
  });

  it("sends focus to the shown pane's landing when the window moves in the background (N5)", async () => {
    await renderPage();
    showWarning();
    focus(button("outside"));
    focus(continueButton());

    clearWarning({});

    expect(warningText()).toBeNull();
    expect(button("lesson 1")).toHaveFocus();
  });

  it("keeps both live containers announced while a modal menu hides the rest of the page (N6)", async () => {
    await renderUnderOpenMenu();

    const wrapper = document.querySelector("[data-notifications]");
    const alert = wrapper?.querySelector(':scope > [role="alert"]');
    const status = wrapper?.querySelector(':scope > [role="status"]');
    expect(alert).toHaveAttribute("aria-live", "assertive");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(alert?.closest('[aria-hidden="true"]')).toBeNull();
    expect(status?.closest('[aria-hidden="true"]')).toBeNull();
    expect(screen.getByText("sibling")).toHaveAttribute("aria-hidden", "true");
  });

  it("keeps the session alert and the idle warning announced when they arrive under an open modal menu (N6b)", async () => {
    await renderUnderOpenMenu();

    expireSession();
    showWarning();

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByText("sibling")).toHaveAttribute("aria-hidden", "true");
    const wrapper = document.querySelector("[data-notifications]");
    const rows = [
      { selector: ':scope > [role="alert"]', live: "assertive", text: sessionExpiredMessage },
      { selector: ':scope > [role="status"]', live: "polite", text: idleWarningMessage(5) },
    ];
    for (const { selector, live, text } of rows) {
      const container = wrapper?.querySelector(selector);
      expect(container).toHaveAttribute("aria-live", live);
      expect(container?.closest('[aria-hidden="true"]')).toBeNull();
      expect(container?.querySelector('[role="alert"], [role="status"]')).toBeNull();
      // Without the text the two checks above would also pass on an empty container.
      expect(container).toHaveTextContent(text);
    }
  });

  it("lands in the shown pane without showing another when focus came from nothing (N7)", async () => {
    await renderPage({ hidden: "lesson" });
    const shown: unknown[] = [];
    const onShow = (event: Event): void => {
      shown.push(event);
    };
    document.addEventListener(SHOW_PANE_EVENT, onShow);
    showWarning();
    focus(continueButton());

    clickCounting(continueButton());

    document.removeEventListener(SHOW_PANE_EVENT, onShow);
    expect(button("environment 1")).toHaveFocus();
    expect(shown).toEqual([]);
  });

  it("sends focus to the start-again action after an idle stop (N8 a)", async () => {
    await renderPage({ hasStatusAction: true });
    showWarning();
    focus(continueButton());

    clearWarning({ isEnvironmentStopped: true });

    expect(button("environment 2")).toHaveFocus();
  });

  it("sends focus to the switch tab of the hidden environment after an idle stop (N8 b)", async () => {
    await renderPage({ hidden: "environment", hasEnvironmentTab: true, hasStatusAction: true });
    showWarning();
    focus(continueButton());

    clearWarning({ isEnvironmentStopped: true });

    expect(screen.getByRole("tab", { name: "environment tab" })).toHaveFocus();
  });

  it("reads only an exact true as a stop (N8 c)", async () => {
    await renderPage({ hasStatusAction: true });
    showWarning();
    focus(continueButton());

    clearWarning({ isEnvironmentStopped: "true" });

    expect(button("lesson 1")).toHaveFocus();
  });

  it("returns to the element a press entered from when the press moved no focus (N9)", async () => {
    await renderPage();
    focus(button("outside"));
    showWarning();
    fireEvent.pointerDown(continueButton());
    act(() => button("outside").blur());
    expect(document.activeElement).toBe(document.body);

    expect(clickCounting(continueButton())).toBe(1);

    expect(warningText()).toBeNull();
    expect(button("outside")).toHaveFocus();
  });

  it("never returns to an element focus had left for the page itself (N10 a)", async () => {
    await renderPage();
    showWarning();
    focus(button("outside"));
    act(() => button("outside").blur());
    focus(continueButton());

    clickCounting(continueButton());

    expect(button("lesson 1")).toHaveFocus();
  });

  it("never returns to an element focus had left for the page itself, entered by a press (N10 b)", async () => {
    await renderPage();
    showWarning();
    focus(button("outside"));
    act(() => button("outside").blur());
    fireEvent.pointerDown(continueButton());
    focus(continueButton());

    clickCounting(continueButton());

    expect(button("lesson 1")).toHaveFocus();
  });

  it("keeps the entry across a window switch back to the same button (N11)", async () => {
    await renderPage();
    showWarning();
    focus(button("outside"));
    focus(continueButton());
    act(() => {
      continueButton().dispatchEvent(
        new FocusEvent("focusout", { bubbles: true, relatedTarget: null }),
      );
      continueButton().dispatchEvent(
        new FocusEvent("focusin", { bubbles: true, relatedTarget: null }),
      );
    });
    expect(continueButton()).toHaveFocus();

    clickCounting(continueButton());

    expect(button("outside")).toHaveFocus();
  });

  it("moves no focus when a background change removes a warning that held none (N12)", async () => {
    const rerender = await renderPage();
    focus(button("outside"));
    showWarning();
    fireEvent.pointerDown(continueButton());
    act(() => button("outside").blur());

    clearWarning({});

    expect(warningText()).toBeNull();
    expect(document.activeElement).toBe(document.body);

    rerender({ hasStatusAction: true });
    showWarning();
    clearWarning({ isEnvironmentStopped: true });

    expect(warningText()).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it("moves no focus when the activation left focus outside the wrapper (N13)", async () => {
    await renderPage();
    showWarning();
    focus(button("outside"));

    expect(clickCounting(continueButton())).toBe(1);

    expect(warningText()).toBeNull();
    expect(button("outside")).toHaveFocus();
  });

  it("starts a later warning with no entry from an earlier one (N14)", async () => {
    await renderPage();
    focus(button("outside"));
    showWarning();
    fireEvent.pointerDown(screen.getByText(idleWarningMessage(5)));
    clearWarning({});
    showWarning();
    act(() => button("outside").blur());

    clickCounting(continueButton());

    expect(button("lesson 1")).toHaveFocus();
  });

  it("removes both capture listeners it adds to the document on unmount (N15)", async () => {
    const add = vi.spyOn(EventTarget.prototype, "addEventListener");
    const remove = vi.spyOn(EventTarget.prototype, "removeEventListener");
    const { unmount } = render(<Notifications />);
    await act(async () => undefined);

    unmount();

    for (const type of ["pointerdown", "focusin"]) {
      const added = add.mock.calls.flatMap((call, index) =>
        add.mock.contexts[index] === document && call[0] === type && call[2] === true
          ? [call[1]]
          : [],
      );
      expect(added.length, `${type} added`).toBeGreaterThan(0);
      for (const listener of added) {
        expect(typeof listener, `${type} listener`).toBe("function");
        const isRemoved = remove.mock.calls.some(
          (call, index) =>
            remove.mock.contexts[index] === document &&
            call[0] === type &&
            call[1] === listener &&
            call[2] === true,
        );
        expect(isRemoved, `${type} removed`).toBe(true);
      }
    }
  });

  it("forgets the origin after an outside press that moved no focus (N16 a)", async () => {
    await renderPage();
    showWarning();
    focus(button("outside"));
    focus(continueButton());
    fireEvent.pointerDown(screen.getByText("the lesson text"));
    expect(continueButton()).toHaveFocus();
    fireEvent.pointerDown(continueButton());

    expect(clickCounting(continueButton())).toBe(1);

    expect(warningText()).toBeNull();
    expect(button("lesson 1")).toHaveFocus();
  });

  it("never returns to another notice after an outside press, entered by a press (N16 b)", async () => {
    await renderPage();
    expireSession();
    showWarning();
    focus(button("outside"));
    const signIn = screen.getByRole("link", { name: signInAgainLabel });
    focus(signIn);
    fireEvent.pointerDown(screen.getByText("the lesson text"));
    expect(signIn).toHaveFocus();
    fireEvent.pointerDown(continueButton());

    clickCounting(continueButton());

    expect(button("lesson 1")).toHaveFocus();
  });

  it("never returns to another notice after an outside press, entered by focus (N16 c)", async () => {
    await renderPage();
    expireSession();
    showWarning();
    focus(button("outside"));
    const signIn = screen.getByRole("link", { name: signInAgainLabel });
    focus(signIn);
    fireEvent.pointerDown(screen.getByText("the lesson text"));
    focus(continueButton());

    clickCounting(continueButton());

    expect(button("lesson 1")).toHaveFocus();
  });

  it("never returns to a stale element after a text press moved focus to the page (N17)", async () => {
    await renderPage();
    showWarning();
    focus(button("outside"));
    focus(continueButton());
    fireEvent.pointerDown(screen.getByText("the lesson text"));
    act(() => continueButton().blur());
    expect(document.activeElement).toBe(document.body);
    fireEvent.pointerDown(continueButton());
    focus(continueButton());

    clickCounting(continueButton());

    expect(button("lesson 1")).toHaveFocus();
  });

  it("keeps a keyboard entry when the button is then pressed (N18)", async () => {
    await renderPage();
    showWarning();
    focus(button("outside"));
    focus(continueButton());
    fireEvent.pointerDown(continueButton());

    clickCounting(continueButton());

    expect(button("outside")).toHaveFocus();
  });

  it("clears the entry when focus leaves the wrapper (N19)", async () => {
    await renderPage();
    showWarning();
    focus(button("outside"));
    fireEvent.pointerDown(screen.getByText(idleWarningMessage(5)));
    focus(button("second outside"));
    focus(continueButton());

    clickCounting(continueButton());

    expect(button("second outside")).toHaveFocus();
  });

  it("keeps focus on another notice when the warning goes in the background", async () => {
    await renderPage();
    expireSession();
    showWarning();
    const signIn = screen.getByRole("link", { name: signInAgainLabel });
    focus(signIn);

    clearWarning({});

    expect(warningText()).toBeNull();
    expect(signIn).toHaveFocus();
  });
});
