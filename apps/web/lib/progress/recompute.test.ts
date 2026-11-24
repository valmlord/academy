// @vitest-environment node
import { inspect } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EveryCourse } from "../course/courses";
import { recomputeOutcomesOnStartup } from "./recompute";

// The database is unreachable: the host name carries a canary, and the driver's error message names the
// host, so a log line built from the message would show it.
const CANARY = "recompute-canary-101";
const UNREACHABLE_URL = `postgres://user:pw@${CANARY}.invalid:5432/academy`;

const ONE_EMPTY_COURSE: EveryCourse = {
  kind: "courses",
  courses: [
    {
      kind: "course",
      tree: { id: "course", title: "Course", description: "A course.", dir: "course", modules: [] },
    },
  ],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("recomputeOutcomesOnStartup", () => {
  it("logs a rejected database call by name and code only and does not exit the process", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    const logInfo = vi.fn<(line: string) => void>();
    const logError = vi.fn<(line: string) => void>();

    await recomputeOutcomesOnStartup({
      databaseUrl: UNREACHABLE_URL,
      readCourses: async () => ONE_EMPTY_COURSE,
      logInfo,
      logError,
    });

    expect(logError.mock.calls).toEqual([
      [expect.stringMatching(/^web: lesson outcome recompute failed: \w+ \(ENOTFOUND\)$/)],
    ]);
    expect(logInfo).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
    const logged = [...logError.mock.calls, ...logInfo.mock.calls]
      .flat()
      .map((value) => inspect(value, { depth: Number.POSITIVE_INFINITY }))
      .join("\n");
    expect(logged).not.toContain(CANARY);
  }, 30_000);
});
