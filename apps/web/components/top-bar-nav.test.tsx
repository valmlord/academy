import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { homeTitle } from "@/lib/copy";
import { TopBarNav } from "./top-bar-nav";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

const COURSE_ID = "ai-for-developers";

function linkNames(): (string | null)[] {
  return screen.getAllByRole("link").map((link) => link.textContent);
}

beforeEach(() => {
  pathname = "/";
});

describe("TopBarNav", () => {
  it("marks the home link current on the dashboard", () => {
    render(<TopBarNav />);

    expect(linkNames()).toEqual([homeTitle]);
    expect(screen.getByRole("link", { name: homeTitle })).toHaveAttribute("aria-current", "page");
  });

  it.each([
    ["the catalog", `/courses/${COURSE_ID}`],
    ["a lesson page", `/courses/${COURSE_ID}/lessons/intro-models-effort`],
    ["the not-found page", "/no/such/path"],
  ])("marks no link current on %s", (_label, path) => {
    pathname = path;
    render(<TopBarNav />);

    expect(linkNames()).toEqual([homeTitle]);
    expect(screen.getByRole("link", { name: homeTitle })).not.toHaveAttribute("aria-current");
  });

  it("puts the links directly in the nav, with no list items", () => {
    render(<TopBarNav />);

    expect(screen.getByRole("navigation").querySelectorAll("li")).toHaveLength(0);
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});
