import { describe, expect, it } from "vitest";
import { InvalidWorkspaceKeyError } from "../../src/errors.js";
import { parseWorkspaceKey, workspaceId, workspaceNames } from "../../src/identity.js";

const KEY = { userId: "user_1", courseId: "ai-for-developers", lessonId: "agent-loop" };

function refusedField(params: Record<string, unknown>): string {
  try {
    parseWorkspaceKey(params);
  } catch (error) {
    if (error instanceof InvalidWorkspaceKeyError) return error.field;
    throw error;
  }
  throw new Error("parseWorkspaceKey accepted the parameters");
}

describe("workspace key", () => {
  it("accepts valid route parameters", () => {
    expect(parseWorkspaceKey(KEY)).toEqual(KEY);
  });

  it.each([
    ["a user id with a slash", { ...KEY, userId: "a/b" }, "userId"],
    ["a 65-character user id", { ...KEY, userId: "u".repeat(65) }, "userId"],
    ["an empty user id", { ...KEY, userId: "" }, "userId"],
    ["a user id that is not a string", { ...KEY, userId: 7 }, "userId"],
    ["an upper-case course id", { ...KEY, courseId: "AI" }, "courseId"],
    ["a course id with a dot", { ...KEY, courseId: "a.b" }, "courseId"],
    ["a lesson id with a trailing hyphen", { ...KEY, lessonId: "loop-" }, "lessonId"],
    ["a missing lesson id", { userId: KEY.userId, courseId: KEY.courseId }, "lessonId"],
  ])("refuses %s naming the field", (_case, params, field) => {
    expect(refusedField(params)).toBe(field);
  });

  it("accepts a 64-character user id", () => {
    expect(parseWorkspaceKey({ ...KEY, userId: "u".repeat(64) }).userId).toHaveLength(64);
  });
});

describe("workspace id and names", () => {
  it("is deterministic and 20 hex characters long", () => {
    const id = workspaceId("local", KEY);

    expect(workspaceId("local", { ...KEY })).toBe(id);
    expect(id).toMatch(/^[0-9a-f]{20}$/);
  });

  it("changes with the instance", () => {
    expect(workspaceId("t31", KEY)).not.toBe(workspaceId("local", KEY));
  });

  it("changes when characters move across the separator between two fields", () => {
    const left = { ...KEY, userId: "ab", courseId: "c" };
    const right = { ...KEY, userId: "a", courseId: "bc" };

    expect(workspaceId("local", left)).not.toBe(workspaceId("local", right));
  });

  it("derives the container, volume and network names", () => {
    expect(workspaceNames("local", "0123456789abcdef0123")).toEqual({
      container: "wks-local-0123456789abcdef0123",
      volume: "wks-local-0123456789abcdef0123-files",
      network: "wks-local-net",
    });
  });
});
