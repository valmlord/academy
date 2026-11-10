import { describe, expect, it } from "vitest";
import { listFilter } from "../../src/identity.js";

// Run only here, never against the daemon: a wider filter would list the owner's objects for removal.
describe("list filter", () => {
  it("is exactly managed=true and this instance", () => {
    expect(listFilter("local")).toEqual({
      label: ["academy.workspace.managed=true", "academy.workspace.instance=local"],
    });
  });

  it("adds only the role label when a role is asked for", () => {
    expect(listFilter("t31", "network")).toEqual({
      label: [
        "academy.workspace.managed=true",
        "academy.workspace.instance=t31",
        "academy.workspace.role=network",
      ],
    });
  });
});
