import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DARK_SCHEME_QUERY } from "@/lib/theme-script";
import { SystemTheme } from "./system-theme";

class UnexpectedQueryError extends Error {
  constructor(query: string) {
    super(`SystemTheme asked matchMedia for "${query}", expected "${DARK_SCHEME_QUERY}"`);
    this.name = "UnexpectedQueryError";
  }
}

interface StubbedScheme {
  setDark: (isDark: boolean) => void;
  addedListeners: EventListener[];
  removedListeners: EventListener[];
}

// jsdom has no matchMedia: a scheme the test flips, firing `change` the way the browser does.
function stubScheme(isDark: boolean): StubbedScheme {
  const target = new EventTarget();
  let matches = isDark;
  const addedListeners: EventListener[] = [];
  const removedListeners: EventListener[] = [];
  vi.stubGlobal("matchMedia", (query: string) => {
    if (query !== DARK_SCHEME_QUERY) throw new UnexpectedQueryError(query);
    return {
      get matches() {
        return matches;
      },
      addEventListener: (type: string, listener: EventListener) => {
        addedListeners.push(listener);
        target.addEventListener(type, listener);
      },
      removeEventListener: (type: string, listener: EventListener) => {
        removedListeners.push(listener);
        target.removeEventListener(type, listener);
      },
    };
  });
  return {
    setDark: (nextIsDark) => {
      matches = nextIsDark;
      act(() => {
        target.dispatchEvent(new Event("change"));
      });
    },
    addedListeners,
    removedListeners,
  };
}

const html = document.documentElement;

describe("SystemTheme", () => {
  // A client-rendered document's <html> starts with no attribute: React's mount removed them.
  beforeEach(() => {
    html.removeAttribute("class");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    html.removeAttribute("class");
  });

  it("puts the dark class on <html> when the system scheme is dark", () => {
    stubScheme(true);

    render(<SystemTheme />);

    expect(html).toHaveClass("dark");
  });

  it("leaves <html> without the dark class when the system scheme is light", () => {
    stubScheme(false);

    render(<SystemTheme />);

    expect(html).not.toHaveClass("dark");
  });

  it("follows a change of the system scheme in both directions", () => {
    const scheme = stubScheme(true);
    render(<SystemTheme />);

    scheme.setDark(false);
    expect(html).not.toHaveClass("dark");
    scheme.setDark(true);

    expect(html).toHaveClass("dark");
  });

  it("removes on unmount the same listener it added", () => {
    const scheme = stubScheme(true);
    const { unmount } = render(<SystemTheme />);

    unmount();

    expect(scheme.addedListeners).toHaveLength(1);
    expect(scheme.removedListeners).toEqual(scheme.addedListeners);
  });
});
