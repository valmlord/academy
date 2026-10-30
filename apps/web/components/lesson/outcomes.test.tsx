import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { collapseOutcomesLabel, showAllOutcomesLabel } from "@/lib/copy";
import { Outcomes } from "./outcomes";

const OUTCOMES = ["First outcome.", "Second outcome.", "Third outcome."];

describe("Outcomes", () => {
  it.each([1, 2])("shows %i outcomes in full without a button", (count) => {
    render(<Outcomes outcomes={OUTCOMES.slice(0, count)} />);

    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(
      OUTCOMES.slice(0, count),
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("collapses three outcomes to the first one, the rest hidden but in the DOM", () => {
    const { container } = render(<Outcomes outcomes={OUTCOMES} />);

    const button = screen.getByRole("button", { name: showAllOutcomesLabel });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("aria-controls", "outcomes-more");
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([OUTCOMES[0]]);
    const more = container.querySelector("ul#outcomes-more");
    expect(more).not.toBeNull();
    expect(more).toHaveAttribute("hidden");
  });

  it("expands to every outcome and offers to collapse", () => {
    render(<Outcomes outcomes={OUTCOMES} />);

    fireEvent.click(screen.getByRole("button", { name: showAllOutcomesLabel }));

    const button = screen.getByRole("button", { name: collapseOutcomesLabel });
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(button).toHaveAttribute("aria-controls", "outcomes-more");
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(OUTCOMES);
  });
});
