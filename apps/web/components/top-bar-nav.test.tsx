import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { courseLinkLabel, homeTitle } from "@/lib/copy";
import { TopBarNav } from "./top-bar-nav";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

const COURSE_ID = "ai-for-developers";

function currentOf(name: string): string | null {
  return screen.getByRole("link", { name }).getAttribute("aria-current");
}

beforeEach(() => {
  pathname = "/";
});

describe("TopBarNav", () => {
  it("marks the home link as the current page on the dashboard", () => {
    render(<TopBarNav courseId={COURSE_ID} />);

    expect(currentOf(homeTitle)).toBe("page");
    expect(currentOf(courseLinkLabel)).toBeNull();
    expect(screen.getByRole("link", { name: courseLinkLabel })).toHaveAttribute(
      "href",
      `/courses/${COURSE_ID}`,
    );
  });

  it("marks the course link as the current page on the catalog", () => {
    pathname = `/courses/${COURSE_ID}`;
    render(<TopBarNav courseId={COURSE_ID} />);

    expect(currentOf(homeTitle)).toBeNull();
    expect(currentOf(courseLinkLabel)).toBe("page");
  });

  it("marks neither link on a lesson page", () => {
    pathname = `/courses/${COURSE_ID}/lessons/intro-models-effort`;
    render(<TopBarNav courseId={COURSE_ID} />);

    expect(currentOf(homeTitle)).toBeNull();
    expect(currentOf(courseLinkLabel)).toBeNull();
  });

  it("marks neither link on the not-found page", () => {
    pathname = "/no/such/path";
    render(<TopBarNav courseId={COURSE_ID} />);

    expect(currentOf(homeTitle)).toBeNull();
    expect(currentOf(courseLinkLabel)).toBeNull();
  });

  it("leaves the course link out when the course id is unknown", () => {
    render(<TopBarNav courseId={undefined} />);

    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual([homeTitle]);
  });

  it("puts the links directly in the nav, with no list items", () => {
    render(<TopBarNav courseId={COURSE_ID} />);

    expect(screen.getByRole("navigation").querySelectorAll("li")).toHaveLength(0);
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});
