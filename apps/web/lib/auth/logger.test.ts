// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { serialised } from "@/test/serialised";
import { createAuthLog } from "./logger";

function recordingLog() {
  const sink = vi.fn((_line: string) => {});
  return { sink, log: createAuthLog(sink) };
}

describe("createAuthLog", () => {
  it("withholds a Drizzle-formatted message and drops its arguments", () => {
    const { sink, log } = recordingLog();

    log("error", "Failed query: select canary-l1 from sessions\nparams: canary-l2", {
      token: "canary-l3",
    });

    expect(serialised(sink.mock.calls)).not.toMatch(/canary-l[123]/);
    expect(sink.mock.calls).toEqual([["better-auth error: database error (details withheld)"]]);
  });

  it("keeps only the first line of a multi-line message", () => {
    const { sink, log } = recordingLog();

    log("error", "boom\ncanary-l4");

    expect(serialised(sink.mock.calls)).not.toContain("canary-l4");
    expect(sink.mock.calls).toEqual([["better-auth error: boom"]]);
  });

  it("drops an error passed as an argument", () => {
    const { sink, log } = recordingLog();

    log("error", "boom", new Error("canary-l5"));

    expect(serialised(sink.mock.calls)).not.toContain("canary-l5");
    expect(sink.mock.calls).toEqual([["better-auth error: boom"]]);
  });

  it("prints a plain message with its level", () => {
    const { sink, log } = recordingLog();

    log("warn", "plain message");

    expect(sink.mock.calls).toEqual([["better-auth warn: plain message"]]);
  });
});
