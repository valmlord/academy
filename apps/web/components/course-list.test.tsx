import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CourseList } from "./course-list";

describe("CourseList", () => {
  it("renders one list item per course with its title", () => {
    const courses = [
      { id: "first-course", title: "First course title" },
      { id: "second-course", title: "Second course title" },
    ];

    render(<CourseList courses={courses} />);

    const items = screen.getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "First course title",
      "Second course title",
    ]);
    expect(screen.getByRole("list")).toBeInTheDocument();
  });
});
