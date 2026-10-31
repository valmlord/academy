// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SessionReadError } from "@/lib/session-reader";
import { CourseReadError } from "./errors";
import { loadOrError } from "./page-error";

describe("loadOrError", () => {
  it("returns the loaded value", async () => {
    const loaded = await loadOrError(async () => 42);

    expect(loaded).toEqual({ ok: true, value: 42 });
  });

  it("turns a course read error into the error view", async () => {
    const error = new CourseReadError("course/course.yaml", "missing");

    const loaded = await loadOrError(async () => {
      throw error;
    });

    expect(loaded).toEqual({ ok: false, error });
  });

  it("rethrows a session read failure instead of showing it as a course error", async () => {
    const act = loadOrError(async () => {
      throw new SessionReadError("db down");
    });

    await expect(act).rejects.toBeInstanceOf(SessionReadError);
  });
});
